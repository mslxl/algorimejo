import type { Extension } from "@codemirror/state"
import type { AlgorimejoEventBus } from "../algorimejo"
import type { Language } from "@/components/editor/language"
import type { AdvLanguageItem } from "@/lib/client"
import { LanguageServerClient, languageServerWithClient } from "@marimo-team/codemirror-languageserver"
import * as log from "@tauri-apps/plugin-log"
import { toast } from "react-toastify"
import { match } from "ts-pattern"
import { getLanguageID } from "@/lib/client/type"
import { LanguageServerStdIOTransport } from "./lsp-stdio-transport"

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

export class LanguageClient {
	private process = new Map<string, any>()
	constructor(private event: AlgorimejoEventBus) { }

	async getClient(lang: AdvLanguageItem, documentUri: string, onTerminal: () => void = () => {}): Promise<Extension> {
		const synataxHighlight = await getLanguageSyntaxExtension(lang.base)
		const extension = [synataxHighlight]
		if (lang.lsp !== null && lang.lsp_connect !== null) {
			const transport = await LanguageServerStdIOTransport.launch(lang.lsp)
			transport.addCloseEventListener(() => {
				onTerminal()
			})

			const client = new LanguageServerClient({
				rootUri: "file:///",
				workspaceFolders: [{
					name: "algorimejo",
					uri: "file:///",
				}],
				transport,
			})
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
			extension.push(lsp)
		}
		return extension
	}

	terminalAll() {

	}
}
