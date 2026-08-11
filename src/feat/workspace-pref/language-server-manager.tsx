import type { LanguageBase, LanguageServerInstallProgress, LanguageServerPackage, LanguageServerProtocolConnectionType } from "@/lib/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlert, CircleCheck, Download, LoaderCircle, Play, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "react-toastify"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { algorimejo } from "@/lib/algorimejo"
import { commands, events } from "@/lib/client"

const queryKey = ["language-server-packages"] as const

interface LanguageServerManagerProps {
	languageBase: LanguageBase
	launchCommand: string | null
	connection: LanguageServerProtocolConnectionType | null
	onUse: (command: string) => Promise<void>
	onDisable: (command: string) => Promise<void>
}

interface ProgressDisplay {
	label: string
	detail: string | null
	value: number | null
}

function formatBytes(value: number): string {
	if (value < 1024)
		return `${value} B`
	if (value < 1024 ** 2)
		return `${(value / 1024).toFixed(1)} KiB`
	return `${(value / 1024 ** 2).toFixed(1)} MiB`
}

function progressDisplay(progress: LanguageServerInstallProgress | null): ProgressDisplay {
	if (progress === null || progress.type === "Preparing") {
		return { label: "Preparing installation", detail: null, value: null }
	}
	if (progress.type === "Downloading") {
		const step = progress.artifact_count > 1
			? `File ${progress.artifact_index} of ${progress.artifact_count}`
			: null
		const hasTotal = progress.total !== null && progress.total > 0
		return {
			label: `Downloading ${progress.artifact}`,
			detail: [
				hasTotal
					? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total!)}`
					: formatBytes(progress.downloaded),
				step,
			].filter(Boolean).join(" · "),
			value: hasTotal ? progress.downloaded / progress.total! * 100 : null,
		}
	}
	if (progress.type === "Extracting") {
		return {
			label: `Extracting ${progress.artifact}`,
			detail: progress.artifact_count > 1
				? `File ${progress.artifact_index} of ${progress.artifact_count}`
				: null,
			value: null,
		}
	}
	if (progress.type === "Installing") {
		return { label: progress.detail, detail: null, value: null }
	}
	return { label: "Activating language server", detail: null, value: null }
}

function replacePackage(
	packages: LanguageServerPackage[] | undefined,
	updated: LanguageServerPackage,
): LanguageServerPackage[] {
	return (packages ?? []).map(item => item.id === updated.id ? updated : item)
}

export function LanguageServerManager({
	languageBase,
	launchCommand,
	connection,
	onUse,
	onDisable,
}: LanguageServerManagerProps) {
	const queryClient = useQueryClient()
	const operationIdRef = useRef<string | null>(null)
	const [installProgress, setInstallProgress] = useState<LanguageServerInstallProgress | null>(null)
	const packages = useQuery({
		queryKey,
		queryFn: commands.listLanguageServerPackages,
		staleTime: 10_000,
	})
	const languageServer = packages.data?.find(item => item.languages.includes(languageBase))

	useEffect(() => {
		let disposed = false
		let unlisten: (() => void) | undefined
		void events.languageServerInstallProgressEvent.listen((event) => {
			if (event.payload.operation_id === operationIdRef.current) {
				setInstallProgress(event.payload.progress)
			}
		}).then((dispose) => {
			if (disposed)
				dispose()
			else
				unlisten = dispose
		})
		return () => {
			disposed = true
			unlisten?.()
		}
	}, [])

	async function stopLanguageServers() {
		algorimejo.langClient.resetAllSessions()
		await commands.killAllLanguageServers()
	}

	async function restartLanguageServers() {
		await queryClient.invalidateQueries({ queryKey: ["language-extension"] })
	}

	const install = useMutation({
		mutationFn: async ({ packageId, operationId, stopServers }: { packageId: string, operationId: string, stopServers: boolean }) => {
			if (stopServers) {
				await stopLanguageServers()
			}
			return commands.installLanguageServerPackage(packageId, operationId)
		},
		onSuccess: async (installed) => {
			queryClient.setQueryData<LanguageServerPackage[]>(queryKey, current => replacePackage(current, installed))
			if (installed.launch_command !== null) {
				await onUse(installed.launch_command)
			}
			toast.success(`${installed.name} ${installed.version} installed`)
		},
		onSettled: async (_data, _error, variables) => {
			if (variables.stopServers) {
				await restartLanguageServers()
			}
			if (operationIdRef.current === variables.operationId) {
				operationIdRef.current = null
				setInstallProgress(null)
			}
		},
	})
	const uninstall = useMutation({
		mutationFn: async ({ packageId }: { packageId: string, name: string, launchCommand: string | null }) => {
			await stopLanguageServers()
			return commands.uninstallLanguageServerPackage(packageId)
		},
		onSuccess: async (_, { packageId, name, launchCommand }) => {
			queryClient.setQueryData<LanguageServerPackage[]>(queryKey, current => (current ?? []).map(item => (
				item.id === packageId
					? { ...item, installed: false, installed_version: null, launch_command: null }
					: item
			)))
			if (launchCommand !== null) {
				await onDisable(launchCommand)
			}
			toast.success(`${name} uninstalled`)
		},
		onSettled: restartLanguageServers,
	})

	if (packages.isPending) {
		return (
			<div className="flex h-10 items-center gap-2 border-y text-sm text-muted-foreground">
				<LoaderCircle className="size-4 animate-spin" />
				Loading managed language servers
			</div>
		)
	}

	if (packages.isError) {
		return (
			<div className="border-y py-3 text-sm text-destructive">
				{String(packages.error)}
			</div>
		)
	}

	if (!languageServer) {
		return (
			<div className="border-y py-3 text-sm text-muted-foreground">
				No managed language server is available for
				{" "}
				{languageBase}
				.
			</div>
		)
	}

	const server = languageServer
	const isConfigured = server.launch_command !== null
		&& launchCommand === server.launch_command
	const isActive = isConfigured && connection === "StdIO"
	const isOutdated = server.installed
		&& server.installed_version !== server.version
	const isBusy = install.isPending || uninstall.isPending
	const mutationError = install.error ?? uninstall.error

	function handleInstall() {
		if (!server.available) {
			toast.error(server.unavailable_reason ?? `${server.name} is not available`)
			return
		}
		const operationId = crypto.randomUUID()
		operationIdRef.current = operationId
		setInstallProgress({ type: "Preparing" })
		install.mutate({ packageId: server.id, operationId, stopServers: server.installed })
	}

	function handleUninstall() {
		uninstall.mutate({ packageId: server.id, name: server.name, launchCommand: server.launch_command })
	}

	const progress = progressDisplay(installProgress)

	return (
		<div className="space-y-3 border-y py-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-sm font-medium">
						{server.name}
						<span className="text-xs font-normal text-muted-foreground">
							{server.installed_version ?? server.version}
						</span>
						{isActive && (
							<span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
								<CircleCheck className="size-3.5" />
								In use
							</span>
						)}
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{(!server.installed || isOutdated) && (
						<Button size="sm" onClick={handleInstall} disabled={isBusy || !server.available}>
							{install.isPending
								? <LoaderCircle className="size-4 animate-spin" />
								: <Download className="size-4" />}
							{isOutdated ? "Update & Use" : "Install & Use"}
						</Button>
					)}
					{server.installed && !isActive && (
						<Button
							size="sm"
							variant="outline"
							disabled={isBusy || server.launch_command === null || !server.available}
							onClick={() => server.launch_command && onUse(server.launch_command)}
						>
							<Play className="size-4" />
							Use
						</Button>
					)}
					{server.installed && (
						<Button size="sm" variant="outline" onClick={handleUninstall} disabled={isBusy}>
							{uninstall.isPending
								? <LoaderCircle className="size-4 animate-spin" />
								: <Trash2 className="size-4" />}
							Uninstall
						</Button>
					)}
				</div>
			</div>

			{install.isPending && (
				<div className="space-y-1.5" aria-live="polite">
					<div className="flex min-w-0 items-center justify-between gap-3 text-xs">
						<span className="truncate text-foreground">{progress.label}</span>
						{progress.detail && <span className="shrink-0 text-muted-foreground">{progress.detail}</span>}
					</div>
					<Progress label={progress.label} value={progress.value} />
				</div>
			)}

			{!server.available && server.unavailable_reason && (
				<div className="flex items-start gap-2 text-sm text-destructive" role="alert">
					<CircleAlert className="mt-0.5 size-4 shrink-0" />
					<p className="break-words">{server.unavailable_reason}</p>
				</div>
			)}

			{mutationError && (
				<p className="text-sm break-words text-destructive">
					{String(mutationError)}
				</p>
			)}
		</div>
	)
}
