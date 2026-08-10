import type { AlgorimejoEvents } from "@/lib/algorimejo/events"
import type { ProgramConfig, WorkspaceConfig } from "@/lib/client"
import * as log from "@tauri-apps/plugin-log"
import { toast } from "react-toastify"
import { fetchProgramConfig } from "@/hooks/use-program-config"
import { fetchWorkspaceConfig } from "@/hooks/use-workspace-config"
import { algorimejo } from "@/lib/algorimejo"
import { commands } from "@/lib/client"

const HEARTBEAT_INTERVAL_MS = 120_000
const LANGUAGE_BASES = new Set(["Cpp", "Python", "TypeScript", "JavaScript", "Go", "Text"])

type DocumentEvent = AlgorimejoEvents["documentOpened"]

let programConfig: ProgramConfig | null = null
let workspaceConfig: WorkspaceConfig | null = null
let lastHeartbeat: { documentID: string, sentAt: number } | null = null
let lastError: string | null = null

function configuredLanguage(language: string): string {
	return workspaceConfig?.language[language]?.base
		?? (LANGUAGE_BASES.has(language) ? language : "Text")
}

async function sendHeartbeat(document: DocumentEvent, isWrite: boolean) {
	if (!programConfig?.wakatime_enabled)
		return

	const now = Date.now()
	if (
		lastHeartbeat?.documentID === document.documentID
		&& now - lastHeartbeat.sentAt < HEARTBEAT_INTERVAL_MS
	) {
		return
	}
	lastHeartbeat = { documentID: document.documentID, sentAt: now }

	try {
		await commands.sendWakatimeHeartbeat(
			document.documentID,
			document.entityName,
			configuredLanguage(document.language),
			isWrite,
		)
		lastError = null
	}
	catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		log.warn(`Failed to send WakaTime heartbeat: ${message}`)
		if (message !== lastError) {
			lastError = message
			toast.warning(`WakaTime: ${message}`)
		}
	}
}

export async function initWakatimeService() {
	const configs = await Promise.all([
		fetchProgramConfig(algorimejo.queryClient),
		fetchWorkspaceConfig(algorimejo.queryClient),
	])
	programConfig = configs[0]
	workspaceConfig = configs[1]

	algorimejo.events.on("programConfigChanged", ({ config }) => {
		programConfig = config
		lastHeartbeat = null
		lastError = null
	})
	algorimejo.events.on("workspaceConfigChanged", ({ config }) => {
		workspaceConfig = config
	})
	algorimejo.events.on("documentOpened", (document) => {
		void sendHeartbeat(document, false)
	})
	algorimejo.events.on("documentChangedDebounced", (document) => {
		void sendHeartbeat(document, true)
	})
}
