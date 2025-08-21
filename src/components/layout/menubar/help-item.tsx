import { MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar"
import { algorimejo } from "@/lib/algorimejo"

export function HelpItem() {
	return (
		<MenubarMenu>
			<MenubarTrigger>Help</MenubarTrigger>
			<MenubarContent>
				<MenubarItem onClick={() => algorimejo.createTab("about", {}, { title: "About", icon: "Info" })}>About</MenubarItem>
			</MenubarContent>
		</MenubarMenu>
	)
}
