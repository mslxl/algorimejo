import { useEffect, useRef } from "react"

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export interface Shortcut {
	/** `Mod` is Cmd on macOS and Ctrl elsewhere */
	mod?: boolean
	ctrl?: boolean
	shift?: boolean
	alt?: boolean
	/** Compared against `KeyboardEvent.code` so layouts and Shift do not change the key */
	code: string
	label: string
}

function shortcut(keys: string, code: string): Shortcut {
	const parts = keys.split("+")
	const key = parts.pop()!
	const mods = new Set(parts)
	const label = [
		mods.has("Ctrl") ? (isMac ? "⌃" : "Ctrl") : null,
		mods.has("Alt") ? (isMac ? "⌥" : "Alt") : null,
		mods.has("Shift") ? (isMac ? "⇧" : "Shift") : null,
		mods.has("Mod") ? (isMac ? "⌘" : "Ctrl") : null,
		key,
	].filter(Boolean).join(isMac ? "" : "+")
	return {
		mod: mods.has("Mod"),
		ctrl: mods.has("Ctrl"),
		shift: mods.has("Shift"),
		alt: mods.has("Alt"),
		code,
		label,
	}
}

export const shortcuts = {
	newProblem: shortcut("Mod+Alt+N", "KeyN"),
	closeTab: shortcut("Mod+W", "KeyW"),
	nextTab: shortcut("Ctrl+Tab", "Tab"),
	previousTab: shortcut("Ctrl+Shift+Tab", "Tab"),
	toggleFileBrowser: shortcut("Mod+Shift+E", "KeyE"),
	toggleTestcase: shortcut("Mod+Shift+T", "KeyT"),
	toggleTerminal: shortcut("Ctrl+`", "Backquote"),
	runAllTestcases: shortcut("Mod+Shift+Enter", "Enter"),
} satisfies Record<string, Shortcut>

export type ShortcutName = keyof typeof shortcuts

export function matchShortcut(e: KeyboardEvent, s: Shortcut) {
	const wantCtrl = !!s.ctrl || (!!s.mod && !isMac)
	const wantMeta = !!s.mod && isMac
	return e.code === s.code
		&& e.ctrlKey === wantCtrl
		&& e.metaKey === wantMeta
		&& e.shiftKey === !!s.shift
		&& e.altKey === !!s.alt
}

/**
 * Bind application wide shortcuts. Handlers run in the capture phase so they also
 * work while the code editor or terminal has focus.
 */
export function useShortcuts(handlers: Partial<Record<ShortcutName, () => void>>) {
	const handlersRef = useRef(handlers)
	handlersRef.current = handlers

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			for (const [name, handler] of Object.entries(handlersRef.current)) {
				if (handler && matchShortcut(e, shortcuts[name as ShortcutName])) {
					e.preventDefault()
					e.stopPropagation()
					handler()
					return
				}
			}
		}
		window.addEventListener("keydown", onKeyDown, { capture: true })
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
	}, [])
}
