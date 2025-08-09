import type { FC, SVGAttributes } from "react"

export interface CreateTabOptions {
	title: string
	icon?: FC<SVGAttributes<SVGElement>>
}

export interface CreateEditorTabOptions extends CreateTabOptions {
	reuseTab?: boolean
	language?: string
}
