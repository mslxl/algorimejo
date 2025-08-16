import type { JSONRPCRequestData } from "@open-rpc/client-js/build/Request"
import { ERR_UNKNOWN, JSONRPCError } from "@open-rpc/client-js/build/Error"
import { getBatchRequests, getNotifications } from "@open-rpc/client-js/build/Request"
import { Transport } from "@open-rpc/client-js/build/transports/Transport.js"
import { commands, events } from "@/lib/client"

export class LanguageServerStdIOTransport extends Transport {
	private constructor(private readonly pid: string) {
		super()
	}

	static async launch(lspLaunchCommand: string): Promise<LanguageServerStdIOTransport> {
		const pid = await commands.launchLanguageServer(lspLaunchCommand, "StdIO")
		return new LanguageServerStdIOTransport(pid)
	}

	async connect(): Promise<any> {
		events.languageServerResponseEvent.listen((event) => {
			if (event.payload.pid === this.pid) {
				this.transportRequestManager.resolveResponse(event.payload.message)
			}
		})
	}

	close(): void {
		commands.killLanguageServer(this.pid)
	}

	async sendData(data: JSONRPCRequestData, timeout: number | null = 5000): Promise<any> {
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
