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
			const params = await commands.getDefaultCreateProblemParams("Unamed Problem", null, null, null)
			return await commands.createProblem(params)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
		},
	})
}
