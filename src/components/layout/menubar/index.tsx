import { Menubar } from "@/components/ui/menubar"
import { MenubarFileItem } from "./file-item"
import { HelpItem } from "./help-item"
import { ViewItem } from "./view-item"

export function AlgorimejoMenubar() {
	return (
		<Menubar className="rounded-none [&>*]:z-1000">
			<MenubarFileItem />
			<ViewItem />
			<HelpItem />
		</Menubar>
	)
}
