import type { Draft } from "immer"
import type { PrefItem } from "@/components/prefs/context"
import type { WorkspaceConfig } from "@/lib/client"
import { produce } from "immer"
import { useCallback, useRef, useState } from "react"
import { toast } from "react-toastify"
import { match } from "ts-pattern"
import { ErrorLabel } from "@/components/error-label"
import { PrefsProvider, PrefsSectionList } from "@/components/prefs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspaceConfig } from "@/hooks/use-workspace-config"
import { useWorkspaceConfigMutation } from "@/hooks/use-workspace-config-mutation"
import { CompilerSection } from "./sections/compiler"
import { EditorSection } from "./sections/editor"
import { WorkspacePrefsChangesetApplyContext, WorkspacePrefsChangesetContext, WorkspacePrefsChangesetSetterContext } from "./workspace-prefs-changeset-context"

export function WorkspacePref() {
	const originalConfig = useWorkspaceConfig()
	const mutation = useWorkspaceConfigMutation()

	const containerRef = useRef<HTMLDivElement | null>(null)
	const [changeset, setChangeset] = useState<WorkspaceConfig | null>(null)

	const saveChangeset = useCallback(async (changeset: WorkspaceConfig) => {
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
	}, [mutation])
	const updateChangeset = useCallback((setter: (changeset: Draft<WorkspaceConfig>) => void, applyInstant?: boolean) => {
		if (!originalConfig.data)
			return
		const newChangeset = match(changeset)
			.with(null, () => produce(originalConfig.data, setter))
			.otherwise(() => produce(changeset, setter))
		if (applyInstant && newChangeset !== null) {
			saveChangeset(newChangeset)
		}
		setChangeset(newChangeset)
	}, [changeset, originalConfig.data, saveChangeset])

	const applyChangeset = useCallback(async () => {
		if (changeset === null)
			return
		saveChangeset(changeset)
	}, [changeset, saveChangeset])

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

	function handleFocusSection(prefItem: PrefItem) {
		const offsetY = prefItem.component.offsetTop
		const scrollArea = containerRef.current?.querySelector("[data-radix-scroll-area-viewport]")
		if (scrollArea) {
			scrollArea.scrollTo({ top: offsetY - 20, behavior: "smooth" })
		}
	}

	return (
		<WorkspacePrefsChangesetContext.Provider value={changeset ?? originalConfig.data!}>
			<WorkspacePrefsChangesetSetterContext.Provider value={updateChangeset}>
				<WorkspacePrefsChangesetApplyContext.Provider value={applyChangeset}>
					{/* Use div ref instead of scrolleara, the lattar not work sometimes */}
					<div className="flex items-stretch" ref={containerRef}>
						<PrefsProvider>
							<PrefsSectionList
								className="min-w-48 border-r px-2"
								onItemClick={handleFocusSection}
							/>
							<ScrollArea className="flex-1">
								<EditorSection />
								<CompilerSection />
							</ScrollArea>
						</PrefsProvider>
					</div>
				</WorkspacePrefsChangesetApplyContext.Provider>
			</WorkspacePrefsChangesetSetterContext.Provider>
		</WorkspacePrefsChangesetContext.Provider>
	)
}
