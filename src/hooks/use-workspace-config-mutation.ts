import type { DatabaseConfig } from "@/lib/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commands } from "@/lib/client"
import { WORKSPACE_CONFIG_QUERY_KEY } from "./use-workspace-config"

export function useWorkspaceConfigMutation() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (data: DatabaseConfig) => commands.setWorkspaceConfig(data),
		onSuccess: () => {
			client.invalidateQueries({
				queryKey: WORKSPACE_CONFIG_QUERY_KEY,
			})
		},
	})
}
