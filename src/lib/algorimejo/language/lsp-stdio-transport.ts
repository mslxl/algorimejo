import type { IJSONRPCData, JSONRPCRequestData } from "@open-rpc/client-js/build/Request"
import type { LanguageServerEvent } from "@/lib/client/local"
import { ERR_UNKNOWN, JSONRPCError } from "@open-rpc/client-js/build/Error"
import { getNotifications } from "@open-rpc/client-js/build/Request"
import { Transport } from "@open-rpc/client-js/build/transports/Transport.js"
import * as log from "@tauri-apps/plugin-log"
import { commands, events } from "@/lib/client/local"
import { Disposable } from "../disposable"

type LanguageServerTerminatedListener = (pid: string) => void
type LanguageServerEventListener = (event: LanguageServerEvent) => void
type TransportState = "idle" | "connecting" | "open" | "closed" | "disposed"

function requestData(data: JSONRPCRequestData): IJSONRPCData[] {
	return Array.isArray(data) ? data.map(batch => batch.request) : [data]
}

class LanguageServerEventHub {
	private listenPromise: Promise<void> | null = null
	private listeners = new Map<string, Set<LanguageServerEventListener>>()

	ready(): Promise<void> {
		if (this.listenPromise === null) {
			this.listenPromise = events.languageServerEvent.listen((event) => {
				this.listeners.get(event.payload.session_id)?.forEach(listener => listener(event.payload))
			}).then(() => undefined).catch((error) => {
				this.listenPromise = null
				throw error
			})
		}
		return this.listenPromise
	}

	attach(sessionID: string, listener: LanguageServerEventListener): Disposable {
		const listeners = this.listeners.get(sessionID) ?? new Set()
		listeners.add(listener)
		this.listeners.set(sessionID, listeners)

		return new Disposable(() => {
			listeners.delete(listener)
			if (listeners.size === 0) {
				this.listeners.delete(sessionID)
			}
		})
	}
}

const languageServerEventHub = new LanguageServerEventHub()

export class LanguageServerStdIOTransport extends Transport {
	private state: TransportState = "idle"
	private pidValue: string | null = null
	private connectPromise: Promise<void> | null = null
	private eventSubscription: Disposable
	private pendingRequests = new Map<string | number, IJSONRPCData>()
	private terminalListeners = new Set<LanguageServerTerminatedListener>()

	private constructor(
		private readonly launchCommand: string,
		private readonly sessionID: string,
		private readonly workspaceUri: string | null,
	) {
		super()
		this.eventSubscription = languageServerEventHub.attach(
			this.sessionID,
			event => this.handleLanguageServerEvent(event),
		)
	}

	get pid(): string | null {
		return this.pidValue
	}

	static async launch(
		lspLaunchCommand: string,
		workspaceUri: string | null = null,
	): Promise<LanguageServerStdIOTransport> {
		await languageServerEventHub.ready()
		return new LanguageServerStdIOTransport(lspLaunchCommand, crypto.randomUUID(), workspaceUri)
	}

	connect(): Promise<void> {
		this.connectPromise ??= this.open()
		return this.connectPromise
	}

	private async open(): Promise<void> {
		if (this.state !== "idle") {
			throw new JSONRPCError(`Cannot connect language server transport in state ${this.state}`, ERR_UNKNOWN)
		}

		this.state = "connecting"
		try {
			this.pidValue = await commands.launchLanguageServer(this.launchCommand, "StdIO", this.sessionID)

			if (this.currentState() === "disposed") {
				await this.killProcess()
				throw new JSONRPCError("Language server transport was disposed during launch", ERR_UNKNOWN)
			}
			if (this.currentState() === "closed") {
				throw new JSONRPCError("Language server terminated during launch", ERR_UNKNOWN)
			}

			this.state = "open"
		}
		catch (error) {
			const state = this.currentState()
			if (state !== "closed" && state !== "disposed") {
				this.state = "closed"
				this.eventSubscription.dispose()
			}
			throw error
		}
	}

	addCloseEventListener(listener: LanguageServerTerminatedListener): Disposable {
		this.terminalListeners.add(listener)
		if (this.state === "closed" && this.pidValue !== null) {
			queueMicrotask(() => listener(this.pidValue!))
		}

		return new Disposable(() => {
			this.terminalListeners.delete(listener)
		})
	}

	close(): void {
		if (this.state === "disposed") {
			return
		}

		this.state = "disposed"
		this.eventSubscription.dispose()
		this.rejectPendingRequests(new JSONRPCError("Language server transport closed", ERR_UNKNOWN))
		this.terminalListeners.clear()
		void this.killProcess()
	}

	async sendData(data: JSONRPCRequestData, timeout: number | null = 5000): Promise<any> {
		await this.connect()
		if (this.state !== "open" || this.pidValue === null) {
			throw new JSONRPCError("Language server closed", ERR_UNKNOWN, null)
		}
		const pid = this.pidValue

		const pending = this.transportRequestManager.addRequest(data, timeout)
		const messages = requestData(data)
		const notifications = getNotifications(data)
		messages.forEach(message => this.pendingRequests.set(message.internalID, message))
		if (!Array.isArray(data)) {
			const clearPendingRequest = () => this.pendingRequests.delete(data.internalID)
			void pending.then(clearPendingRequest, clearPendingRequest)
		}

		void commands.sendMessageToLanguageServer(
			pid,
			this.sessionID,
			JSON.stringify(this.parseData(data)),
		).then(() => {
			this.transportRequestManager.settlePendingRequest(notifications)
			notifications.forEach(notification => this.pendingRequests.delete(notification.internalID))
		}).catch((error) => {
			const jsonError = new JSONRPCError(
				error instanceof Error ? error.message : String(error),
				ERR_UNKNOWN,
				error,
			)
			this.settleRequests(messages, jsonError)
			this.fail(jsonError, pid)
			void this.killProcess()
		})

		return pending
	}

	private handleLanguageServerEvent(event: LanguageServerEvent): void {
		this.pidValue ??= event.pid

		if (event.response.type === "Message") {
			if (this.state === "connecting" || this.state === "open") {
				this.handleMessage(event.response.msg)
			}
			return
		}

		if (this.state === "closed" || this.state === "disposed") {
			return
		}

		const error = new JSONRPCError(
			`Language server ${event.pid} terminated with exit code ${event.response.exit_code}`,
			ERR_UNKNOWN,
			event.response,
		)
		this.fail(error, event.pid)
	}

	private handleMessage(message: string): void {
		let payload: unknown
		try {
			payload = JSON.parse(message)
		}
		catch {
			this.transportRequestManager.resolveResponse(message)
			return
		}

		const packets = Array.isArray(payload) ? payload : [payload]
		const clientPackets: unknown[] = []
		for (const packet of packets) {
			if (this.isServerRequest(packet)) {
				void this.respondToServerRequest(packet)
				continue
			}

			if (this.isRecord(packet) && (typeof packet.id === "string" || typeof packet.id === "number")) {
				this.pendingRequests.delete(packet.id)
			}
			clientPackets.push(packet)
		}

		if (clientPackets.length === 1) {
			this.transportRequestManager.resolveResponse(JSON.stringify(clientPackets[0]))
		}
		else if (clientPackets.length > 1) {
			this.transportRequestManager.resolveResponse(JSON.stringify(clientPackets))
		}
	}

	private async respondToServerRequest(request: Record<string, any>): Promise<void> {
		if (this.pidValue === null || (this.state !== "connecting" && this.state !== "open")) {
			return
		}

		const pid = this.pidValue
		const response = this.serverRequestResponse(request)
		try {
			await commands.sendMessageToLanguageServer(
				pid,
				this.sessionID,
				JSON.stringify({
					jsonrpc: "2.0",
					id: request.id,
					...response,
				}),
			)
		}
		catch (error) {
			const jsonError = new JSONRPCError(
				`Failed to respond to language server request ${request.method}: ${String(error)}`,
				ERR_UNKNOWN,
				error,
			)
			this.fail(jsonError, pid)
			void this.killProcess()
		}
	}

	private serverRequestResponse(request: Record<string, any>): Record<string, unknown> {
		switch (request.method) {
			case "workspace/configuration":
				if (!Array.isArray(request.params?.items)) {
					return { error: { code: -32602, message: "Invalid workspace/configuration parameters" } }
				}
				return { result: request.params.items.map(() => null) }
			case "workspace/workspaceFolders":
				return {
					result: this.workspaceUri === null
						? null
						: [{ name: "algorimejo", uri: this.workspaceUri }],
				}
			case "workspace/applyEdit":
				return {
					result: {
						applied: false,
						failureReason: "Workspace edits are not supported by this client",
					},
				}
			case "window/showDocument":
				return { result: { success: false } }
			case "window/showMessageRequest":
			case "window/workDoneProgress/create":
				return { result: null }
			default:
				return { error: { code: -32601, message: `Method not supported: ${request.method}` } }
		}
	}

	private rejectPendingRequests(error: JSONRPCError): void {
		this.settleRequests([...this.pendingRequests.values()], error)
	}

	private settleRequests(requests: IJSONRPCData[], error: JSONRPCError): void {
		this.transportRequestManager.settlePendingRequest(requests, error)
		requests.forEach(request => this.pendingRequests.delete(request.internalID))
	}

	private fail(error: JSONRPCError, pid: string): void {
		if (this.state === "closed" || this.state === "disposed") {
			return
		}

		this.state = "closed"
		this.eventSubscription.dispose()
		this.rejectPendingRequests(error)
		log.warn(error.message)
		const listeners = [...this.terminalListeners]
		this.terminalListeners.clear()
		listeners.forEach((listener) => {
			try {
				listener(pid)
			}
			catch (listenerError) {
				log.warn(`Language server close listener failed: ${String(listenerError)}`)
			}
		})
	}

	private async killProcess(): Promise<void> {
		if (this.pidValue === null) {
			return
		}
		try {
			await commands.killLanguageServer(this.pidValue, this.sessionID)
		}
		catch (error) {
			log.warn(`Failed to kill language server ${this.pidValue}: ${String(error)}`)
		}
	}

	private isServerRequest(value: unknown): value is Record<string, any> {
		return this.isRecord(value)
			&& typeof value.method === "string"
			&& (typeof value.id === "string" || typeof value.id === "number")
	}

	private isRecord(value: unknown): value is Record<string, any> {
		return typeof value === "object" && value !== null
	}

	private currentState(): TransportState {
		return this.state
	}
}
