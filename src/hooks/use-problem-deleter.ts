import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "@/lib/client";
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list";

export function useProblemDeleter() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (problemId: string) => {
			return await commands.deleteProblem(problemId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] });
		},
	});
}
