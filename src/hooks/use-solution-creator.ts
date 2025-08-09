import type { CreateSolutionParams } from "@/lib/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commands } from "@/lib/client"
import { problemQueryKeyOf } from "./use-problem"
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list"

export function useSolutionCreator() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: {
			problemId: string
			params: CreateSolutionParams
		}) => {
			return commands.createSolution(params.problemId, params.params)
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
			queryClient.invalidateQueries({
				queryKey: problemQueryKeyOf(variables.problemId),
			})
		},
	})
}
