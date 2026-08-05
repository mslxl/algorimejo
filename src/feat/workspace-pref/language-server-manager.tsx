import type { LanguageBase, LanguageServerPackage, LanguageServerProtocolConnectionType } from "@/lib/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleCheck, Download, LoaderCircle, Play, Trash2 } from "lucide-react"
import { toast } from "react-toastify"
import { Button } from "@/components/ui/button"
import { algorimejo } from "@/lib/algorimejo"
import { commands } from "@/lib/client"

const queryKey = ["language-server-packages"] as const

interface LanguageServerManagerProps {
	languageBase: LanguageBase
	launchCommand: string | null
	connection: LanguageServerProtocolConnectionType | null
	onUse: (command: string) => void
	onDisable: () => void
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
	const packages = useQuery({
		queryKey,
		queryFn: commands.listLanguageServerPackages,
		staleTime: 10_000,
	})
	const languageServer = packages.data?.find(item => item.languages.includes(languageBase))

	const install = useMutation({
		mutationFn: async ({ packageId, stopServers }: { packageId: string, stopServers: boolean }) => {
			if (stopServers) {
				algorimejo.langClient.terminalAll()
				await commands.killAllLanguageServers()
			}
			return commands.installLanguageServerPackage(packageId)
		},
		onSuccess: (installed) => {
			queryClient.setQueryData<LanguageServerPackage[]>(queryKey, current => replacePackage(current, installed))
			if (installed.launch_command !== null) {
				onUse(installed.launch_command)
			}
			toast.success(`${installed.name} ${installed.version} installed`)
		},
	})
	const uninstall = useMutation({
		mutationFn: async ({ packageId }: { packageId: string, name: string, disable: boolean }) => {
			algorimejo.langClient.terminalAll()
			await commands.killAllLanguageServers()
			return commands.uninstallLanguageServerPackage(packageId)
		},
		onSuccess: (_, { packageId, name, disable }) => {
			queryClient.setQueryData<LanguageServerPackage[]>(queryKey, current => (current ?? []).map(item => (
				item.id === packageId
					? { ...item, installed: false, installed_version: null, launch_command: null }
					: item
			)))
			if (disable) {
				onDisable()
			}
			toast.success(`${name} uninstalled`)
		},
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
		install.mutate({ packageId: server.id, stopServers: server.installed })
	}

	function handleUninstall() {
		uninstall.mutate({ packageId: server.id, name: server.name, disable: isConfigured })
	}

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
						<Button size="sm" onClick={handleInstall} disabled={isBusy}>
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
							disabled={isBusy || server.launch_command === null}
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

			{mutationError && (
				<p className="text-sm break-words text-destructive">
					{String(mutationError)}
				</p>
			)}
		</div>
	)
}
