import type { WheelEvent } from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import * as React from "react"
import { useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { ScrollBar } from "./ui/scroll-area"

export function TabbarScrollArea({
	className,
	children,
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
	const viewportRef = useRef<HTMLDivElement | null>(null)

	const onWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
		if (!viewportRef.current || e.deltaY === 0 || e.deltaX !== 0)
			return
		e.preventDefault()

		const delta = e.deltaY
		const curPos = viewportRef.current.scrollLeft
		const scrollWidth = viewportRef.current.scrollWidth

		const pos = Math.max(0, Math.min(scrollWidth, curPos + delta))
		viewportRef.current.scrollLeft = pos
	}, [])

	return (
		<ScrollAreaPrimitive.Root
			data-slot="scroll-area"
			className={cn("relative", className)}
			onWheel={onWheel}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				data-slot="scroll-area-viewport"
				className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
				ref={viewportRef}
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollBar orientation="horizontal" className="h-1" />
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	)
}
