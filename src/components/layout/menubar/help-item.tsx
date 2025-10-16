import { uniqueId } from "lodash"
import { MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar"
import { algorimejo } from "@/lib/algorimejo"

export function HelpItem() {
	return (
		<MenubarMenu>
			<MenubarTrigger>Help</MenubarTrigger>
			<MenubarContent>
				<MenubarItem onClick={() => algorimejo.tab.openTab({
					key: "about",
					title: "About",
					icon: "Info",
					id: uniqueId("tab-"),
					data: {},
				})}
				>
					About
				</MenubarItem>
			</MenubarContent>
		</MenubarMenu>
	)
}
