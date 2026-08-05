import type { PtyProcessEventKind } from "./client"
import * as log from "@tauri-apps/plugin-log"
import { v4 as uuidv4 } from "uuid"
import { algorimejo } from "./algorimejo"
import { commands, events } from "./client"

const MAX_BUFFERED_BYTES = 4 * 1024 * 1024
const encoder = new TextEncoder()

export type EmbeddedTerminalStatus = "idle" | "starting" | "running" | "stopping" | "exited" | "error"

export interface EmbeddedTerminalSnapshot {
	status: EmbeddedTerminalStatus
	sessionId: string | null
	exitCode: number | null
	signal: string | null
	error: string | null
}

export type EmbeddedTerminalOutputEvent
	= | { type: "data", data: Uint8Array, source: EmbeddedTerminalOutputSource }
		| { type: "clear" }

export type EmbeddedTerminalOutputSource = "stdout" | "stderr"

export interface EmbeddedTerminalOutputChunk {
	data: Uint8Array
	source: EmbeddedTerminalOutputSource
}

class EmbeddedTerminalService {
	private snapshot: EmbeddedTerminalSnapshot = {
		status: "idle",
		sessionId: null,
		exitCode: null,
		signal: null,
		error: null,
	}

	private stateListeners = new Set<() => void>()
	private outputListeners = new Set<(event: EmbeddedTerminalOutputEvent) => void>()
	private outputChunks: EmbeddedTerminalOutputChunk[] = []
	private bufferedBytes = 0
	private cols = 80
	private rows = 24
	private eventListenerPromise: Promise<void> | null = null

	getSnapshot = () => this.snapshot

	subscribe = (listener: () => void) => {
		this.stateListeners.add(listener)
		return () => this.stateListeners.delete(listener)
	}

	subscribeOutput(listener: (event: EmbeddedTerminalOutputEvent) => void) {
		this.outputListeners.add(listener)
		return () => this.outputListeners.delete(listener)
	}

	getBufferedOutput() {
		return this.outputChunks
	}

	private setSnapshot(patch: Partial<EmbeddedTerminalSnapshot>) {
		this.snapshot = { ...this.snapshot, ...patch }
		this.stateListeners.forEach(listener => listener())
	}

	private appendOutput(data: Uint8Array, source: EmbeddedTerminalOutputSource = "stdout") {
		if (data.byteLength > MAX_BUFFERED_BYTES) {
			data = data.slice(data.byteLength - MAX_BUFFERED_BYTES)
			this.outputChunks = []
			this.bufferedBytes = 0
		}

		this.outputChunks.push({ data, source })
		this.bufferedBytes += data.byteLength
		while (this.bufferedBytes > MAX_BUFFERED_BYTES && this.outputChunks.length > 1) {
			this.bufferedBytes -= this.outputChunks.shift()!.data.byteLength
		}
		this.outputListeners.forEach(listener => listener({ type: "data", data, source }))
	}

	private handleProcessEvent(sessionId: string, event: PtyProcessEventKind) {
		if (sessionId !== this.snapshot.sessionId)
			return

		if (event.type === "Output") {
			this.appendOutput(Uint8Array.from(event.data))
		}
		else if (event.type === "Stderr") {
			this.appendOutput(Uint8Array.from(event.data), "stderr")
		}
		else if (event.type === "Exit") {
			const suffix = event.signal ? ` (${event.signal})` : ""
			this.appendOutput(encoder.encode(`\r\n[Process exited with code ${event.exit_code}${suffix}]\r\n`))
			this.setSnapshot({
				status: "exited",
				exitCode: event.exit_code,
				signal: event.signal,
			})
		}
		else {
			this.appendOutput(encoder.encode(`\r\n[Terminal error: ${event.message}]\r\n`), "stderr")
			this.setSnapshot({ status: "error", error: event.message })
		}
	}

	private async ensureEventListener() {
		if (!this.eventListenerPromise) {
			this.eventListenerPromise = events.ptyProcessEvent.listen((event) => {
				this.handleProcessEvent(event.payload.session_id, event.payload.event)
			}).then(() => {})
		}
		await this.eventListenerPromise
	}

	async launch(taskTag: string, command: string) {
		await this.ensureEventListener()
		const previousSessionId = this.snapshot.sessionId
		if (previousSessionId && ["starting", "running", "stopping"].includes(this.snapshot.status)) {
			await commands.killPtySession(previousSessionId).catch(error => log.warn(`failed to stop previous PTY session: ${error}`))
		}

		const sessionId = uuidv4()
		this.outputChunks = []
		this.bufferedBytes = 0
		this.outputListeners.forEach(listener => listener({ type: "clear" }))
		this.setSnapshot({
			status: "starting",
			sessionId,
			exitCode: null,
			signal: null,
			error: null,
		})
		algorimejo.dock.select("bottom", "terminal")

		try {
			await commands.launchPtySession(sessionId, taskTag, command, {}, this.cols, this.rows)
			if (this.snapshot.sessionId === sessionId && this.snapshot.status === "starting") {
				this.setSnapshot({ status: "running" })
			}
		}
		catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.appendOutput(encoder.encode(`[Failed to launch terminal: ${message}]\r\n`), "stderr")
			this.setSnapshot({ status: "error", error: message })
			throw error
		}
	}

	write(data: string) {
		if (!this.snapshot.sessionId || this.snapshot.status !== "running")
			return
		commands.writePtySession(this.snapshot.sessionId, data)
			.catch(error => log.warn(`failed to write to PTY: ${error}`))
	}

	resize(cols: number, rows: number) {
		this.cols = Math.max(1, Math.min(1000, cols))
		this.rows = Math.max(1, Math.min(1000, rows))
		if (!this.snapshot.sessionId || !["starting", "running"].includes(this.snapshot.status))
			return
		commands.resizePtySession(this.snapshot.sessionId, this.cols, this.rows)
			.catch(error => log.trace(`failed to resize PTY: ${error}`))
	}

	kill() {
		if (!this.snapshot.sessionId || !["starting", "running"].includes(this.snapshot.status))
			return
		this.setSnapshot({ status: "stopping" })
		commands.killPtySession(this.snapshot.sessionId)
			.catch((error) => {
				const message = error instanceof Error ? error.message : String(error)
				this.setSnapshot({ status: "error", error: message })
			})
	}

	clear() {
		this.outputChunks = []
		this.bufferedBytes = 0
		this.outputListeners.forEach(listener => listener({ type: "clear" }))
	}
}

export const embeddedTerminal = new EmbeddedTerminalService()
