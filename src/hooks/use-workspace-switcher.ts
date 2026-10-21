import * as process from "@tauri-apps/plugin-process"
import { useCallback } from "react"
import { toast } from "react-toastify"
import { useProgramConfig } from "./use-program-config"
import { useProgramConfigMutation } from "./use-program-config-mutation"

const MAX_HISTORY = 10

export function getFolderName(path: string) {
	const parts = path.split(/[/\\]/).filter(Boolean)
	return parts[parts.length - 1] || path
}

/**
 * Switching workspace persists the choice and relaunches the app, since every
 * workspace owns its own database
 */
export function useWorkspaceSwitcher() {
	const programConfig = useProgramConfig()
	const mutation = useProgramConfigMutation()

	const switchTo = useCallback(async (path: string) => {
		try {
			const currentConfig = programConfig.data
			if (!currentConfig)
				return

			await mutation.mutateAsync({
				...currentConfig,
				workspace: path,
				workspace_history: [
					path,
					...currentConfig.workspace_history.filter(p => p !== path),
				].slice(0, MAX_HISTORY),
			})
			await process.relaunch()
		}
		catch {
			toast.error("Failed to switch workspace")
		}
	}, [mutation, programConfig.data])

	const reset = useCallback(async () => {
		try {
			if (!programConfig.data)
				return
			await mutation.mutateAsync({
				...programConfig.data,
				workspace: null,
			})
			await process.relaunch()
		}
		catch {
			toast.error("Failed to reset workspace")
		}
	}, [mutation, programConfig.data])

	const removeFromHistory = useCallback(async (pathToRemove: string) => {
		try {
			const currentConfig = programConfig.data
			if (!currentConfig)
				return
			await mutation.mutateAsync({
				...currentConfig,
				workspace_history: currentConfig.workspace_history.filter(p => p !== pathToRemove),
			})
		}
		catch {
			toast.error("Failed to remove from history")
		}
	}, [mutation, programConfig.data])

	return {
		programConfig,
		currentWorkspace: programConfig.data?.workspace ?? null,
		history: programConfig.data?.workspace_history ?? [],
		switchTo,
		reset,
		removeFromHistory,
	}
}
