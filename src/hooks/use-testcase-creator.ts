import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commands } from "@/lib/client"
import { testcaseQueryKeyOf } from "./use-testcases"

export function useTestcaseCreator() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (problemID: string) => {
			return await commands.createTestcase(problemID)
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({
				queryKey: testcaseQueryKeyOf(variables),
			})
		},
	})
}
