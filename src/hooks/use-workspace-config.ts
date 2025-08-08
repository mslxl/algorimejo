import { useQuery } from "@tanstack/react-query";
import { algorimejo } from "@/lib/algorimejo";
import { commands, events } from "@/lib/client";

export const WORKSPACE_CONFIG_QUERY_KEY = ["workspace-config"];

export function useWorkspaceConfig() {
	return useQuery({
		queryKey: WORKSPACE_CONFIG_QUERY_KEY,
		queryFn: () => commands.getWorkspaceConfig(),
	});
}

events.programConfigUpdateEvent.listen(() => {
	algorimejo.queryClient.invalidateQueries({
		queryKey: WORKSPACE_CONFIG_QUERY_KEY,
	});
});
