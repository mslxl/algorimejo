import type { HTMLAttributes } from "react"
import type { PrefItem } from "./context"
import { groupBy } from "lodash/fp"
import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { usePrefItems } from "./context"

interface PrefsSectionListProps extends HTMLAttributes<HTMLUListElement> {
	onItemClick?: (item: PrefItem) => void
}

export function PrefsSectionList({ className, onItemClick, ...props }: PrefsSectionListProps) {
	const items = usePrefItems()

	const sections = useMemo(() =>
		Object.entries(groupBy("section", items ?? []))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, values]) => ({
				key,
				item: values[0],
			})), [items])

	return (
		<ul className={cn("space-y-1 py-2", className)} {...props}>
			{sections.map(item => (
				<li key={item.key}>
					<button
						className="group flex w-full items-center gap-2 rounded-md px-4 py-2 text-left text-sm transition-colors duration-200 hover:bg-accent/50 focus:ring-2 focus:ring-ring/50 focus:outline-none"
						type="button"
						onClick={() => {
							onItemClick?.(item.item)
						}}
					>
						<span className="h-1 w-1 rounded-full bg-foreground/50 transition-colors group-hover:bg-foreground/70" />
						<span className="text-foreground/70 transition-colors group-hover:text-foreground">
							{item.key}
						</span>
					</button>
				</li>
			))}
		</ul>
	)
}
