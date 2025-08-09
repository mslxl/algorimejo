import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export function TreeStyledLi({
	className,
	...props
}: HTMLAttributes<HTMLLIElement>) {
	return (
		<li
			{...props}
			className={cn(
				className,
				"relative flex items-center pl-5",
				"hover:bg-secondary",
				"before:content-[''] before:absolute before:left-2 before:top-0 before:h-full before:w-0.5 before:bg-gray-300",
				"after:content-[''] after:absolute after:left-2 after:top-1/2 after:h-0.5 after:w-2 after:bg-gray-300",
				"last:before:h-1/2",
			)}
		/>
	)
}
