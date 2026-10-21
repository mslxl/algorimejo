import type { PanelButtonProps } from "@/lib/algorimejo/algorimejo"
import { LucidePlaySquare } from "lucide-react"
import { SidebarButtonDefault } from "@/components/layout/sidebar-button-default"
import { Button } from "@/components/ui/button"
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
			<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center select-none">
				<h2 className="text-lg font-semibold text-foreground">No active solution</h2>
				<p className="text-sm text-muted-foreground">
					Open a solution to see and run its testcases.
				</p>
				<Button size="sm" variant="outline" onClick={handleOpenFileBrowser}>
					Browse problems
				</Button>
			</div>
		)
	}

	return <TestcaseContent tab={currentTab} />
}
