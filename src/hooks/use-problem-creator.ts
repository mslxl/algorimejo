import type { CreateProblemParams } from "@/lib/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commands } from "@/lib/client"
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list"

export function useProblemCreator() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (params: CreateProblemParams) => {
			return await commands.createProblem(params)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
		},
	})
}

export function useDefaultProblemCreator() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async () => {
			return await commands.createProblem({
				name: "Unamed Problem",
				url: null,
				description: null,
				statement: null,
				checker: null,
				time_limit: 3000,
				memory_limit: 5 * 1024,
				initial_solution: {
					name: "Solution 1",
					language: "cpp", // TODO: make default language configurable
					author: null,
					content: null,
				},
			})
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
		},
	})
}
