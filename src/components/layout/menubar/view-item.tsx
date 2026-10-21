import type { ShortcutName } from "@/lib/shortcuts"
import {
	MenubarCheckboxItem,
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarSeparator,
	MenubarShortcut,
	MenubarTrigger,
} from "@/components/ui/menubar"
import { algorimejo } from "@/lib/algorimejo"
import { useObservable } from "@/lib/observable"
import { shortcuts } from "@/lib/shortcuts"

const panels: { key: string, title: string, shortcut: ShortcutName }[] = [
	{ key: "file-browser", title: "Problems", shortcut: "toggleFileBrowser" },
	{ key: "testcase", title: "Testcases", shortcut: "toggleTestcase" },
	{ key: "terminal", title: "Terminal", shortcut: "toggleTerminal" },
]

export function ViewItem() {
	const leftSelected = useObservable(algorimejo.dock.leftSelected)
	const rightSelected = useObservable(algorimejo.dock.rightSelected)
	const bottomSelected = useObservable(algorimejo.dock.bottomSelected)
	const openPanels = [leftSelected, rightSelected, bottomSelected]
	return (
		<MenubarMenu>
			<MenubarTrigger>View</MenubarTrigger>
			<MenubarContent>
				{panels.map(panel => (
					<MenubarCheckboxItem
						key={panel.key}
						checked={openPanels.includes(panel.key)}
						onCheckedChange={() => algorimejo.dock.toggle(panel.key)}
					>
						{panel.title}
						<MenubarShortcut>{shortcuts[panel.shortcut].label}</MenubarShortcut>
					</MenubarCheckboxItem>
				))}
				<MenubarSeparator />
				<MenubarItem onClick={() => algorimejo.tab.cycleTab(1)}>
					Next Tab
					<MenubarShortcut>{shortcuts.nextTab.label}</MenubarShortcut>
				</MenubarItem>
				<MenubarItem onClick={() => algorimejo.tab.cycleTab(-1)}>
					Previous Tab
					<MenubarShortcut>{shortcuts.previousTab.label}</MenubarShortcut>
				</MenubarItem>
			</MenubarContent>
		</MenubarMenu>
	)
}
