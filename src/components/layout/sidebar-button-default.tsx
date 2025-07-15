import { LucideMoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type { PanelButtonProps } from "@/lib/algorimejo/algorimejo";
import { cn } from "@/lib/utils";

interface SidebarButtonDefaultProps extends PanelButtonProps {
	children?: ReactNode;
}

export function SidebarButtonDefault({
	onClick,
	isSelected,
	children,
	key,
}: SidebarButtonDefaultProps) {
	return (
		<button
			type="button"
			className={cn("flex px-2 gap-1 items-center hover:bg-secondary", {
				"bg-secondary": isSelected,
			})}
			onClick={onClick}
		>
			{children ?? (
				<>
					<LucideMoreHorizontal className="size-4 rotate-90" />
					{key}
				</>
			)}
		</button>
	);
}
