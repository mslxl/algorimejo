import type { Extension } from "@codemirror/state"
import type { AdvLanguageItem, LanguageBase } from "@/lib/client"
import { LanguageServerClient, languageServerWithClient } from "@marimo-team/codemirror-languageserver"
import { useQuery } from "@tanstack/react-query"
import * as log from "@tauri-apps/plugin-log"
import { toast } from "react-toastify"
import { match } from "ts-pattern"
import { getLanguageID } from "@/lib/client/type"
import { LanguageServerStdIOTransport } from "./lsp-stdio-transport"

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

export async function getLanguageExtension(lang: AdvLanguageItem, documentUri: string): Promise<Extension> {
	const extensions = []

	const syntaxExtension = await getLanguageSyntaxExtension(lang.base)
	extensions.push(syntaxExtension)

	if (lang.lsp !== null && lang.lsp_connect !== null) {
		const client = new LanguageServerClient({
			rootUri: "file:///",
			workspaceFolders: [{
				name: "algorimejo",
				uri: "file:///",
			}],
			transport: await LanguageServerStdIOTransport.launch(lang.lsp),
			initializationOptions: {
				settings: {
					// TODO: need fix pylyzer
					// python: { path: "C:/Users/lnslf/scoop/apps/miniconda3/current/python.exe" },
				},
			},
		},
		)
		client.onNotification((notification) => {
			const method = notification.method as string
			const param = notification.params as any
			if (method === "window/showMessage") {
				toast.info(`Language Server: ${param.message}`)
			}
		})
		const lsp = languageServerWithClient({
			documentUri,
			languageId: getLanguageID(lang.base),
			client,
			allowHTMLContent: true,
		})
		extensions.push(lsp)
	}

	return extensions
}

export function useLanguageExtension(lang: AdvLanguageItem, documentUri: string) {
	return useQuery({
		queryKey: ["language-extension", lang, documentUri],
		queryFn: () => getLanguageExtension(lang, documentUri),
		staleTime: Infinity,
		gcTime: Infinity,
		retry: false,
		refetchInterval: Infinity,
	})
}
