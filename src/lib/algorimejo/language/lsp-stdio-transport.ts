import type { JSONRPCRequestData } from "@open-rpc/client-js/build/Request"
import { ERR_UNKNOWN, JSONRPCError } from "@open-rpc/client-js/build/Error"
import { getBatchRequests, getNotifications } from "@open-rpc/client-js/build/Request"
import { Transport } from "@open-rpc/client-js/build/transports/Transport.js"
import * as log from "@tauri-apps/plugin-log"
import { commands, events } from "@/lib/client"
import { Disposable } from "../disposable"

type LanguageServerTerminatedListener = (pid: string) => void

export class LanguageServerStdIOTransport extends Transport {
	private closed: boolean
	private terminalListener = new Set<LanguageServerTerminatedListener>()
	private constructor(public readonly pid: string) {
		super()
		this.closed = true
	}

	static async launch(lspLaunchCommand: string): Promise<LanguageServerStdIOTransport> {
		const pid = await commands.launchLanguageServer(lspLaunchCommand, "StdIO")
		return new LanguageServerStdIOTransport(pid)
	}

	async connect(): Promise<any> {
		this.closed = false
		events.languageServerEvent.listen((event) => {
			if (event.payload.pid === this.pid && event.payload.response.type === "Message") {
				this.transportRequestManager.resolveResponse(event.payload.response.msg)
			}
			else if (event.payload.pid === this.pid && event.payload.response.type === "Closed") {
				log.warn(`Language Client Transport closed, reason: language server process ${this.pid} terminated`)
				this.terminalListener.forEach(f => f(this.pid))
				this.closed = true
			}
		})
	}

	addCloseEventListener(l: LanguageServerTerminatedListener): Disposable {
		this.terminalListener.add(l)
		return new Disposable(() => {
			this.terminalListener.delete(l)
		})
	}

	close(): void {
		commands.killLanguageServer(this.pid)
	}

	async sendData(data: JSONRPCRequestData, timeout: number | null = 5000): Promise<any> {
		if (this.closed) {
			throw new JSONRPCError("Language server closed", ERR_UNKNOWN, null)
		}
		let prom = this.transportRequestManager.addRequest(data, timeout)
		const notifications = getNotifications(data)
		try {
			await commands.sendMessageToLanguageServer(this.pid, JSON.stringify(this.parseData(data)))
			this.transportRequestManager.settlePendingRequest(notifications)
		}
		catch (e) {
			const jsonError = new JSONRPCError((e as any).message, ERR_UNKNOWN, e)

			this.transportRequestManager.settlePendingRequest(notifications, jsonError)
			this.transportRequestManager.settlePendingRequest(getBatchRequests(data), jsonError)

			prom = Promise.reject(jsonError)
		}

		return prom
	}
}
