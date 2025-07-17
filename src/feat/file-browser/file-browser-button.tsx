import { LucideFile } from "lucide-react";
import { SidebarButtonDefault } from "@/components/layout/sidebar-button-default";
import type { PanelButtonProps } from "@/lib/algorimejo/algorimejo";

export function FileBrowerButton(props: PanelButtonProps) {
	return (
		<SidebarButtonDefault {...props}>
			<LucideFile className="size-4 rotate-90" />
			FileBrower
		</SidebarButtonDefault>
	);
}
