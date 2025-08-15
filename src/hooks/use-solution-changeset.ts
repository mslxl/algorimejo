import type { SolutionChangeset } from "@/lib/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commands } from "@/lib/client"
import { problemQueryKeyOf } from "./use-problem"
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list"

export function useSolutionChangeset() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async ({
			id,
			changeset,
		}: {
			id: string
			problemID: string
			changeset: SolutionChangeset
		}) => {
			return await commands.updateSolution(id, changeset)
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
			queryClient.invalidateQueries({
				queryKey: problemQueryKeyOf(variables.problemID),
			})
		},
	})
}
