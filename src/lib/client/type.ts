import type { AdvLanguageItem, LanguageBase, LanguageServerProtocolConnectionType } from "./local"
import { identity } from "lodash"
import { sortBy } from "lodash/fp"
import { match } from "ts-pattern"

export const languageBaseValues: LanguageBase[] = sortBy(identity, ["Cpp", "TypeScript", "Python", "JavaScript", "Go", "Text"])
export const languageServerProtocolConnectionTypeValues: LanguageServerProtocolConnectionType[] = ["StdIO", "WebSocket"]
export const textLanguageItem: AdvLanguageItem = {
	base: "Text",
	cmd_compile: "",
	cmd_before_run: null,
	cmd_after_run: null,
	cmd_run: "",
	lsp: null,
	lsp_connect: null,
}

export function getLanguageID(language: LanguageBase) {
	return match(language)
		.with("Cpp", () => "cpp")
		.with("Python", () => "python")
		.with("TypeScript", () => "typescript")
		.with("JavaScript", () => "javascript")
		.with("Go", () => "go")
		.otherwise(() => "text")
}

export function getFileExtensionOfLanguage(language: LanguageBase) {
	return match(language)
		.with("Cpp", () => "cpp")
		.with("Python", () => "py")
		.with("TypeScript", () => "ts")
		.with("JavaScript", () => "js")
		.with("Go", () => "go")
		.with("Text", () => "txt")
		.exhaustive()
}
