import type { ProgramConfigData } from "@/lib/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commands } from "@/lib/client"
import { PROGRAM_CONFIG_QUERY_KEY } from "./use-program-config"

export function useProgramConfigMutation() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (data: ProgramConfigData) => commands.setProgConfig(data),
		onSuccess: () => {
			client.invalidateQueries({
				queryKey: PROGRAM_CONFIG_QUERY_KEY,
			})
		},
	})
}
