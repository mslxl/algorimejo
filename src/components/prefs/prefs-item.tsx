import { useContext, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { PrefSectionContext, usePrefItemsDispatch } from "./context"

interface PrefsItemProps extends React.HTMLAttributes<HTMLDivElement> {
	name: string
	description: string
	children?: React.ReactNode
	hoverHighlight?: boolean
}

export function PrefsItem({ children, name, description, className, hoverHighlight = true, ...props }: PrefsItemProps) {
	const itemRef = useRef<HTMLDivElement>(null)
	const dispatch = usePrefItemsDispatch()!
	const section = useContext(PrefSectionContext)!

	useEffect(() => {
		if (!itemRef.current)
			return
		const item = {
			description,
			name,
			section,
			component: itemRef.current,
		}
		dispatch({
			type: "add",
			item,
		})
		return () => {
			dispatch({
				type: "remove",
				item,
			})
		}
	}, [name, section, description, dispatch])

	return (
		<div
			ref={itemRef}
			className={cn("flex flex-col gap-2 p-4 hover:border-accent border-transparent transition-colors select-none", {
				"hover:bg-secondary": hoverHighlight,
			}, className)}
			{...props}
		>
			<div className="space-y-1.5">
				<h3 className="text-sm leading-none font-medium">
					{/* <span className="text-muted-foreground">
						{section}
						:
						{" "}
					</span> */}
					{name}
				</h3>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<div className="flex items-center gap-2 select-auto">
				{children}
			</div>
		</div>
	)
}
