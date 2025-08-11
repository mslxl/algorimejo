import type { DatabaseConfig } from "@/lib/client"
import { EditorView } from "@codemirror/view"
import { getCodemirrorThemeExtension } from "../themes/theme"

export function configExtension(config: DatabaseConfig) {
	return [
		EditorView.theme({
			"&": {
				fontSize: `${config.font_size}pt`,
				height: "100%",
			},
			".cm-content": {
				fontSize: `${config.font_size}pt`,
				fontFamily: config.font_family!,
			},
			".cm-gutters": {
				fontSize: `${config.font_size}pt`,
			},
		}),
		getCodemirrorThemeExtension(config.theme),
	]
}
