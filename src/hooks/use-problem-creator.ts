import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CreateProblemParams, commands } from "@/lib/client";
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list";

export function useProblemCreator() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (params: CreateProblemParams) => {
			return await commands.createProblem(params);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] });
		},
	});
}
