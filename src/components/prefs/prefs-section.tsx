import type { ReactNode } from "react"
import { PrefSectionContext } from "./context"

interface PrefSectionProps {
	section: string
	children?: ReactNode
}

export function PrefsSection({ children, section }: PrefSectionProps) {
	return (
		<PrefSectionContext.Provider value={section}>
			<h3 className="flex items-center gap-2 px-4 text-lg font-medium select-none after:h-[1px] after:flex-1 after:bg-border">
				{section}
			</h3>
			{children}
		</PrefSectionContext.Provider>
	)
}
