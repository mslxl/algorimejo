import type { ProgramConfig, WorkspaceConfig } from "@/lib/client"
import { EditorView } from "@codemirror/view"
import { getCodemirrorThemeExtension } from "../themes/theme"

export function configExtension(wsCfg: WorkspaceConfig, progCfg: ProgramConfig) {
	return [
		EditorView.theme({
			"&": {
				fontSize: `${wsCfg.font_size}pt`,
				height: "100%",
			},
			".cm-content": {
				fontSize: `${wsCfg.font_size}pt`,
				fontFamily: wsCfg.font_family!,
			},
			".cm-gutters": {
				fontSize: `${wsCfg.font_size}pt`,
			},
		}),
		getCodemirrorThemeExtension(progCfg.theme),
	]
}
