import type { LucideIconName } from "@/components/lucide-icon"

export interface CreateTabOptions {
	title: string
	icon?: LucideIconName
}

export interface CreateEditorTabOptions extends CreateTabOptions {
	reuseTab?: boolean
	language?: string
}
