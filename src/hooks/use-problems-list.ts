import { useInfiniteQuery } from "@tanstack/react-query";
import { commands, type GetProblemsSortBy, type SortOrder } from "@/lib/client";

export const PROBLEMS_LIST_QUERY_KEY = "problems";
export function useProblemsInfiniteQuery(
	search: string | null = null,
	sort_by: GetProblemsSortBy | null = null,
	sort_order: SortOrder | null = null,
) {
	return useInfiniteQuery({
		queryKey: [PROBLEMS_LIST_QUERY_KEY, search, sort_by, sort_order],
		queryFn: async ({ pageParam }) => {
			return await commands.getProblems({
				cursor: pageParam.cursor,
				search,
				sort_by,
				sort_order,
				limit: 40,
			});
		},
		initialPageParam: { cursor: null as string | null },
		getNextPageParam: (p) => {
			if (p.has_more) {
				return {
					cursor: p.next_cursor,
				};
			}
			return undefined;
		},
	});
}
