import { useMutation, useQueryClient } from "@tanstack/react-query";
import { commands, type ProblemChangeset } from "@/lib/client";
import { problemQueryKeyOf } from "./use-problem";
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list";

export function useProblemChangeset() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			changeset,
		}: {
			id: string;
			changeset: ProblemChangeset;
		}) => {
			return await commands.updateProblem(id, changeset);
		},
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] });
			queryClient.invalidateQueries({
				queryKey: problemQueryKeyOf(variables.id),
			});
		},
	});
}
