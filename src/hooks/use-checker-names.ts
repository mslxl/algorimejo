import { useQuery } from "@tanstack/react-query"
import { commands } from "@/lib/client"

export const CHECKERS_QUERY_KEY = ["checkers"]

export function useCheckers(problemID?: string) {
	return useQuery({
		queryKey: CHECKERS_QUERY_KEY.concat(problemID ?? "global"),
		queryFn: () => commands.getVisibleCheckers(problemID ?? null),
	})
}
