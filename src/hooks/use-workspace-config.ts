import type { QueryClient } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import { algorimejo } from "@/lib/algorimejo"
import { commands, events } from "@/lib/client"

export const WORKSPACE_CONFIG_QUERY_KEY = ["workspace-config"]

export function useWorkspaceConfig() {
	return useQuery({
		queryKey: WORKSPACE_CONFIG_QUERY_KEY,
		queryFn: () => commands.getWorkspaceConfig(),
	})
}

export function fetchWorkspaceConfig(client: QueryClient) {
	return client.fetchQuery({
		queryKey: WORKSPACE_CONFIG_QUERY_KEY,
		queryFn: () => commands.getWorkspaceConfig(),
	})
}

events.workspaceConfigUpdateEvent.listen((e) => {
	algorimejo.queryClient.invalidateQueries({
		queryKey: WORKSPACE_CONFIG_QUERY_KEY,
	})
	algorimejo.events.emit("workspaceConfigChanged", {
		config: e.payload.new,
	})
})
