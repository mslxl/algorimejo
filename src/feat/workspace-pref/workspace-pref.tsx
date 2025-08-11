import type { Draft } from "immer"
import type { DatabaseConfig } from "@/lib/client"
import { produce } from "immer"
import { Suspense, useCallback, useState } from "react"
import { toast } from "react-toastify"
import { ErrorLabel } from "@/components/error-label"
import { PrefsProvider, PrefsSectionList } from "@/components/prefs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspaceConfig } from "@/hooks/use-workspace-config"
import { useWorkspaceConfigMutation } from "@/hooks/use-workspace-config-mutation"
import { PrefsChangesetApplyContext, PrefsChangesetContext, PrefsChangesetSetterContext } from "./prefs-changeset-context"
import { CompilerSection, EditorSection } from "./sections"

export function WorkspacePref() {
	const originalConfig = useWorkspaceConfig()
	const mutation = useWorkspaceConfigMutation()

	const [changeset, setChangeset] = useState<DatabaseConfig | null>(null)

	const updateChangeset = useCallback((setter: (changeset: Draft<DatabaseConfig>) => void) => {
		if (!originalConfig.data)
			return
		if (changeset == null) {
			setChangeset(produce(originalConfig.data, setter))
		}
		else {
			setChangeset(produce(changeset, setter))
		}
	}, [changeset, originalConfig.data])

	const applyWorkspace = useCallback(async () => {
		if (changeset === null)
			return

		await mutation.mutateAsync(changeset, {
			onError: (error) => {
				if (error instanceof Error) {
					toast.error(`Fail to save workspace config: ${error.message}`)
				}
				else {
					toast.error(`Fail to save workspace config: ${error}`)
				}
			},
			onSuccess: () => {
				setChangeset(null)
			},
		})
	}, [changeset, mutation])

	if (originalConfig.status === "pending") {
		return (
			<div className="space-y-1">
				<Skeleton className="h-[1em] w-full" />
				<Skeleton className="h-[1em] w-full" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-[1em] w-full" />
				<Skeleton className="h-[1em] w-full" />
				<Skeleton className="h-9 w-full" />
			</div>
		)
	}
	else if (originalConfig.status === "error") {
		return <ErrorLabel message={originalConfig.error} />
	}

	return (
		<PrefsChangesetContext.Provider value={changeset ?? originalConfig.data!}>
			<PrefsChangesetSetterContext.Provider value={updateChangeset}>
				<PrefsChangesetApplyContext.Provider value={applyWorkspace}>
					<div className="flex items-stretch">
						<PrefsProvider>
							<PrefsSectionList className="min-w-48 border-r px-2" />
							<ScrollArea className="flex-1">
								<Suspense fallback={<Skeleton className="h-9 w-full" />}>
									<EditorSection />
								</Suspense>
								<Suspense fallback={<Skeleton className="h-9 w-full" />}>
									<CompilerSection />
								</Suspense>
							</ScrollArea>
						</PrefsProvider>
					</div>
				</PrefsChangesetApplyContext.Provider>
			</PrefsChangesetSetterContext.Provider>
		</PrefsChangesetContext.Provider>
	)
}
