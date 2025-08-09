import type { PanelButtonProps } from "@/lib/algorimejo/algorimejo"
import type { OpenedTab } from "@/stores/tab-slice"
import { LucidePlaySquare } from "lucide-react"
import { SidebarButtonDefault } from "@/components/layout/sidebar-button-default"
import { useAppDispatch } from "@/hooks/use-app-dispatch"
import { useAppSelector } from "@/hooks/use-app-selector"
import * as sidebarReducers from "@/stores/sidebar-slice"
import { TestcaseContent } from "./testcase-content"

export function TestcaseButton(props: PanelButtonProps) {
	return (
		<SidebarButtonDefault {...props}>
			<LucidePlaySquare className="size-4 rotate-90" />
			Test
		</SidebarButtonDefault>
	)
}

export function Testcase() {
	const dispatch = useAppDispatch()
	const currentTab = useAppSelector(
		state =>
			(state.tab.tabs[state.tab.selected] as undefined | OpenedTab) ?? null,
	)
	function handleOpenFileBrowser() {
		dispatch(sidebarReducers.select({ key: "file-browser" }))
	}
	if (currentTab === null || currentTab.key !== "editor") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center select-none">
				<h1 className="text-3xl font-bold text-gray-800">No Active Solution</h1>
				<p className="text-muted-foreground">
					Please open a solution file to begin programming and testing.
				</p>
				<p className="text-sm text-muted-foreground">
					Use the
					{" "}
					<button
						type="button"
						className="text-blue-500 hover:underline"
						onClick={handleOpenFileBrowser}
					>
						file browser
					</button>
					{" "}
					panel to select and open a solution.
				</p>
			</div>
		)
	}

	return <TestcaseContent tab={currentTab} />
}
