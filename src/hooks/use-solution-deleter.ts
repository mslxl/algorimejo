import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commands } from "@/lib/client";
import { problemQueryKeyOf } from "./use-problem";
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list";

export function useSolutionDeleter() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (solutionID: string) => {
			return await commands.deleteSolution(solutionID);
		},
		onSuccess: (problemID) => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] });
			queryClient.invalidateQueries({
				queryKey: problemQueryKeyOf(problemID),
			});
		},
	});
}
