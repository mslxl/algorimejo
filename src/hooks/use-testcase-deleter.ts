import { useMutation, useQueryClient } from "@tanstack/react-query"
import { commands } from "@/lib/client"

export function useProblemDeleter() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (testcaseID: string) => {
			return await commands.deleteTestcase(testcaseID)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["testcases"],
			})
		},
	})
}
