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
const lastHeartbeats = new Map<string, { sentAt: number, isWrite: boolean }>()
const heartbeatQueues = new Map<string, Promise<void>>()
let lastError: string | null = null

function configuredLanguage(language: string): string {
	return workspaceConfig?.language[language]?.base
		?? (LANGUAGE_BASES.has(language) ? language : "Text")
}

async function sendHeartbeat(document: DocumentEvent, isWrite: boolean) {
	if (!programConfig?.wakatime_enabled)
		return

	const now = Date.now()
	const lastHeartbeat = lastHeartbeats.get(document.documentID)
	const isWithinInterval = lastHeartbeat && now - lastHeartbeat.sentAt < HEARTBEAT_INTERVAL_MS
	if (isWithinInterval && (!isWrite || lastHeartbeat.isWrite)) {
		return
	}

	try {
		await commands.sendWakatimeHeartbeat(
			document.documentID,
			document.entityName,
			configuredLanguage(document.language),
			isWrite,
		)
		lastHeartbeats.set(document.documentID, { sentAt: Date.now(), isWrite })
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

function queueHeartbeat(document: DocumentEvent, isWrite: boolean) {
	const previous = heartbeatQueues.get(document.documentID) ?? Promise.resolve()
	const current = previous.then(() => sendHeartbeat(document, isWrite))
	heartbeatQueues.set(document.documentID, current)
	void current.finally(() => {
		if (heartbeatQueues.get(document.documentID) === current)
			heartbeatQueues.delete(document.documentID)
	})
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
		lastHeartbeats.clear()
		lastError = null
	})
	algorimejo.events.on("workspaceConfigChanged", ({ config }) => {
		workspaceConfig = config
	})
	algorimejo.events.on("documentOpened", (document) => {
		queueHeartbeat(document, false)
	})
	algorimejo.events.on("documentChangedDebounced", (document) => {
		queueHeartbeat(document, true)
	})
}
