import type { PanelButtonProps } from "@/lib/algorimejo/algorimejo"
import { LucidePlaySquare } from "lucide-react"
import { SidebarButtonDefault } from "@/components/layout/sidebar-button-default"
import { algorimejo } from "@/lib/algorimejo"
import { useObservable } from "@/lib/observable"
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
	const currentTab = useObservable(algorimejo.tab.selectedTab)

	function handleOpenFileBrowser() {
		algorimejo.dock.select(null, "file-browser")
	}
	if (currentTab === null || currentTab.key !== "solution-editor") {
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
