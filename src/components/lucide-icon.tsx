import * as LucideIconSet from "lucide-react"

export type LucideIconName = keyof {
	[K in keyof typeof LucideIconSet as typeof LucideIconSet[K] extends React.FC<React.SVGAttributes<SVGElement>> ? K : never]: typeof LucideIconSet[K]
}
export function LucideIcon({ name, className }: { name: LucideIconName, className?: string }) {
	const Icon = LucideIconSet[name]
	return <Icon className={className} />
}
