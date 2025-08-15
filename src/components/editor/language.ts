import type { Extension } from "@codemirror/state"
import type { LanguageBase } from "@/lib/client"
import { useQuery } from "@tanstack/react-query"
import * as log from "@tauri-apps/plugin-log"
import { match } from "ts-pattern"

export type Language = LanguageBase | "Text"

function getLanguageSyntaxExtension(lang: Language): Promise<Extension> {
	return match(lang)
		.with("Text", () => Promise.resolve([]))
		.with("Cpp", () => import("@codemirror/lang-cpp").then(mod => mod.cpp()))
		.with("Python", () => import("@codemirror/lang-python").then(mod => mod.python()))
		.with("TypeScript", () => import("@codemirror/lang-javascript").then(mod => mod.javascript({ typescript: true })))
		.with("JavaScript", () => import("@codemirror/lang-javascript").then(mod => mod.javascript({ typescript: false })))
		.with("Go", () => import("@codemirror/lang-go").then(mod => mod.go()))
		.otherwise(() => {
			log.warn(`unknown language: ${lang}`)
			return Promise.resolve([])
		})
}

export function getLanguageExtension(lang: Language): Promise<Extension> {
	// TODO: Language Server Protocol required here
	return getLanguageSyntaxExtension(lang)
}

export function useLanguageExtension(lang: Language) {
	return useQuery({
		queryKey: ["language-extension", lang],
		queryFn: () => getLanguageExtension(lang),
		staleTime: Infinity,
		gcTime: Infinity,
		retry: false,
		refetchInterval: Infinity,
	})
}
