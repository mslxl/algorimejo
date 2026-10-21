import type { ReactNode } from "react"
import type { PanelButtonProps } from "@/lib/algorimejo/algorimejo"
import { LucideMoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarButtonDefaultProps extends PanelButtonProps {
	children?: ReactNode
}

export function SidebarButtonDefault({
	onClick,
	isSelected,
	position,
	children,
	key,
}: SidebarButtonDefaultProps) {
	return (
		<button
			type="button"
			aria-pressed={isSelected}
			className={cn(
				"flex px-2 py-1.5 gap-1 items-center text-sm text-muted-foreground border-transparent transition-colors hover:bg-secondary hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
				// Selection marker sits on the edge facing the panel it opens
				{
					"border-l-2": position === "left",
					"border-r-2": position === "right",
					"border-t-2": position === "bottom",
					"bg-secondary text-foreground border-primary": isSelected,
				},
			)}
			onClick={onClick}
		>
			{children ?? (
				<>
					<LucideMoreHorizontal className="size-4 rotate-90" />
					{key}
				</>
			)}
		</button>
	)
}
