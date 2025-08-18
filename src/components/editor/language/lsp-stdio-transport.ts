import type { JSONRPCRequestData } from "@open-rpc/client-js/build/Request"
import { ERR_UNKNOWN, JSONRPCError } from "@open-rpc/client-js/build/Error"
import { getBatchRequests, getNotifications } from "@open-rpc/client-js/build/Request"
import { Transport } from "@open-rpc/client-js/build/transports/Transport.js"
import { commands, events } from "@/lib/client"

export class LanguageServerStdIOTransport extends Transport {
	private closed: boolean
	private constructor(private readonly pid: string) {
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
				this.closed = true
			}
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
