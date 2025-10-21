import type { AlgorimejoEvents } from "@/lib/algorimejo/events"
import { error, trace } from "@tauri-apps/plugin-log"
import { toast } from "react-toastify"
import { fetchProblem } from "@/hooks/use-problem"
import { fetchSolution } from "@/hooks/use-solution"
import { fetchWorkspaceConfig } from "@/hooks/use-workspace-config"
import { algorimejo } from "@/lib/algorimejo"
import { commands } from "@/lib/client"

async function listener({ problemID, solutionID, ytext }: AlgorimejoEvents["solutionDocumentChangedDebounced"]) {
	try {
		const [solution, problem] = await Promise.all(
			[
				fetchSolution(algorimejo.queryClient, solutionID, problemID),
				fetchProblem(algorimejo.queryClient, problemID),
			],
		)
		await commands.saveDuplicatedFile(problem, solution, ytext.toString())
	}
	catch (e) {
		if (e instanceof Error) {
			error(e.message)
			toast.error(`SaveDupFile: ${e.message}`)
		}
		else {
			error(e as string)
			toast.error(`SaveDupFile: ${e}`)
		}
	}
}

export async function initBackupService() {
	function update(enable: boolean) {
		trace(`auto save duplicated file status: ${enable}`)
		if (enable) {
			algorimejo.events.on("solutionDocumentChangedDebounced", listener)
		}
		else {
			algorimejo.events.off("solutionDocumentChangedDebounced", listener)
		}
	}

	algorimejo.events.on("workspaceConfigChanged", (event) => {
		update(event.config.duplicate_save)
	})

	const config = await fetchWorkspaceConfig(algorimejo.queryClient)
	update(config.duplicate_save)
}
