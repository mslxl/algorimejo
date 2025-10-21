import type { QueryClient } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import { algorimejo } from "@/lib/algorimejo"
import { commands, events } from "@/lib/client"

export const PROGRAM_CONFIG_QUERY_KEY = ["program-config"]

export function useProgramConfig() {
	return useQuery({
		queryKey: PROGRAM_CONFIG_QUERY_KEY,
		queryFn: () => commands.getProgConfig(),
	})
}

export function fetchProgramConfig(client: QueryClient) {
	return client.fetchQuery({
		queryKey: PROGRAM_CONFIG_QUERY_KEY,
		queryFn: () => commands.getProgConfig(),
	})
}

events.programConfigUpdateEvent.listen((e) => {
	algorimejo.queryClient.invalidateQueries({
		queryKey: PROGRAM_CONFIG_QUERY_KEY,
	})
	algorimejo.events.emit("programConfigChanged", {
		config: e.payload.new,
	})
})
