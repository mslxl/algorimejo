import type { ProgramConfig, WorkspaceConfig } from "@/lib/client"
import { EditorView } from "@codemirror/view"
import { emacs } from "@replit/codemirror-emacs"
import { vim } from "@replit/codemirror-vim"
import { match } from "ts-pattern"
import { getCodemirrorThemeExtension } from "../themes/theme"

export function configExtension(wsCfg: WorkspaceConfig, progCfg: ProgramConfig) {
	const keymap = match(progCfg.keymap)
		.with("Default", () => [])
		.with("Vim", () => vim())
		.with("Emacs", () => emacs())
		.exhaustive()
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
		keymap,
	]
}
