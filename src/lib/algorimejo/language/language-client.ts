import type { Extension } from "@codemirror/state"
import type { Language } from "@/components/editor/language"
import type { AdvLanguageItem } from "@/lib/client"
import { LanguageServerClient, languageServerWithClient } from "@marimo-team/codemirror-languageserver"
import * as log from "@tauri-apps/plugin-log"
import { toast } from "react-toastify"
import { match } from "ts-pattern"
import { getLanguageID } from "@/lib/client/type"
import { LanguageServerStdIOTransport } from "./lsp-stdio-transport"

interface LanguageServerSession {
	extension: Extension
	dispose: () => void
}

interface ManagedLanguageServerSession {
	promise: Promise<LanguageServerSession>
}

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

function disableDynamicRegistration<T>(capabilities: T): T {
	const visit = (value: unknown): unknown => {
		if (Array.isArray(value)) {
			return value.map(visit)
		}
		if (typeof value !== "object" || value === null) {
			return value
		}

		return Object.fromEntries(Object.entries(value).map(([key, item]) => [
			key,
			key === "dynamicRegistration" ? false : visit(item),
		]))
	}

	return visit(capabilities) as T
}

export class LanguageClient {
	private process = new Map<string, ManagedLanguageServerSession>()
	private references = new Map<string, number>()
	private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

	getSessionKey(lang: AdvLanguageItem, documentUri: string): string {
		return JSON.stringify([lang.base, lang.lsp, lang.lsp_connect, documentUri])
	}

	async getClient(lang: AdvLanguageItem, documentUri: string, onTerminal: () => void = () => {}): Promise<Extension> {
		const syntaxHighlight = await getLanguageSyntaxExtension(lang.base)
		if (lang.lsp === null || lang.lsp_connect === null) {
			return [syntaxHighlight]
		}
		if (lang.lsp_connect !== "StdIO") {
			throw new Error(`Unsupported language server connection type: ${lang.lsp_connect}`)
		}

		const key = this.getSessionKey(lang, documentUri)
		const existing = this.process.get(key)
		if (existing) {
			return (await existing.promise).extension
		}

		let managedSession!: ManagedLanguageServerSession
		const promise = this.createSession(lang, documentUri, syntaxHighlight, () => {
			if (this.process.get(key) === managedSession) {
				this.process.delete(key)
			}
			onTerminal()
		}).catch((error) => {
			if (this.process.get(key) === managedSession) {
				this.process.delete(key)
			}
			throw error
		})
		managedSession = { promise }
		this.process.set(key, managedSession)

		return (await promise).extension
	}

	retainSession(key: string): void {
		this.references.set(key, (this.references.get(key) ?? 0) + 1)
		const timer = this.cleanupTimers.get(key)
		if (timer !== undefined) {
			clearTimeout(timer)
			this.cleanupTimers.delete(key)
		}
	}

	releaseSession(key: string, onDisposed: () => void): void {
		const references = Math.max((this.references.get(key) ?? 1) - 1, 0)
		this.references.set(key, references)
		if (references > 0) {
			return
		}

		const timer = setTimeout(() => {
			this.cleanupTimers.delete(key)
			if ((this.references.get(key) ?? 0) > 0) {
				return
			}

			this.references.delete(key)
			const session = this.process.get(key)
			this.process.delete(key)
			if (session) {
				void session.promise.then(value => value.dispose()).catch(() => {})
			}
			onDisposed()
		}, 30_000)
		this.cleanupTimers.set(key, timer)
	}

	terminalAll(): void {
		this.cleanupTimers.forEach(timer => clearTimeout(timer))
		this.cleanupTimers.clear()
		this.references.clear()
		this.resetAllSessions()
	}

	resetAllSessions(): void {
		const sessions = [...this.process.values()]
		this.process.clear()
		sessions.forEach((session) => {
			void session.promise.then(value => value.dispose()).catch(() => {})
		})
	}

	private async createSession(
		lang: AdvLanguageItem,
		documentUri: string,
		syntaxHighlight: Extension,
		onTerminal: () => void,
	): Promise<LanguageServerSession> {
		const transport = await LanguageServerStdIOTransport.launch(lang.lsp!, null)
		const closeListener = transport.addCloseEventListener(onTerminal)
		const client = new LanguageServerClient({
			rootUri: "file:///",
			workspaceFolders: null,
			capabilities: disableDynamicRegistration,
			transport,
		})

		try {
			await client.initializePromise
		}
		catch (error) {
			closeListener.dispose()
			client.close()
			throw error
		}

		client.onNotification((notification) => {
			const method = notification.method as string
			const param = notification.params as any
			if (method === "window/showMessage") {
				toast.info(`Language Server: ${param.message}`)
			}
		})

		return {
			extension: [
				syntaxHighlight,
				languageServerWithClient({
					documentUri,
					languageId: getLanguageID(lang.base),
					client,
					allowHTMLContent: true,
				}),
			],
			dispose: () => {
				closeListener.dispose()
				client.close()
			},
		}
	}
}
