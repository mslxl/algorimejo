import type { Draft } from "immer"
import type { PrefItem } from "@/components/prefs/context"
import type { ProgramConfig } from "@/lib/client"
import { produce } from "immer"
import { useCallback, useRef, useState } from "react"
import { toast } from "react-toastify"
import { match } from "ts-pattern"
import { ErrorLabel } from "@/components/error-label"
import { PrefsProvider, PrefsSectionList } from "@/components/prefs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useProgramConfig } from "@/hooks/use-program-config"
import { useProgramConfigMutation } from "@/hooks/use-program-config-mutation"
import { ProgramPrefsChangesetApplyContext, ProgramPrefsChangesetContext, ProgramPrefsChangesetSetterContext } from "./program-prefs-changeset-context"
import { ToolsSection } from "./sections/tools"
import { WindowsSection } from "./sections/windows"

export function ProgramPref() {
	const originalConfig = useProgramConfig()
	const mutation = useProgramConfigMutation()

	const [changeset, setChangeset] = useState<ProgramConfig | null>(null)
	const containerRef = useRef<HTMLDivElement | null>(null)

	const saveChangeset = useCallback(async (changeset: ProgramConfig) => {
		await mutation.mutateAsync(changeset, {
			onError: (error) => {
				if (error instanceof Error) {
					toast.error(`Fail to save program config: ${error.message}`)
				}
				else {
					toast.error(`Fail to save program config: ${error}`)
				}
			},
			onSuccess: () => {
				setChangeset(null)
			},
		})
	}, [mutation])

	const updateChangeset = useCallback((setter: (changeset: Draft<ProgramConfig>) => void, applyInstant?: boolean) => {
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
		<ProgramPrefsChangesetContext.Provider value={changeset ?? originalConfig.data!}>
			<ProgramPrefsChangesetSetterContext.Provider value={updateChangeset}>
				<ProgramPrefsChangesetApplyContext.Provider value={applyChangeset}>
					<div className="flex items-stretch" ref={containerRef}>
						<PrefsProvider>
							<PrefsSectionList
								className="min-w-48 border-r px-2"
								onItemClick={handleFocusSection}
							/>
							<ScrollArea className="flex-1">
								<WindowsSection />
								<ToolsSection />
							</ScrollArea>
						</PrefsProvider>
					</div>
				</ProgramPrefsChangesetApplyContext.Provider>
			</ProgramPrefsChangesetSetterContext.Provider>
		</ProgramPrefsChangesetContext.Provider>
	)
}
