import type { QueryClient } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"
import { commands } from "@/lib/client"

export function problemQueryKeyOf(id: string) {
	return ["problem", id]
}

export function useProblem(id: string) {
	return useQuery({
		queryKey: problemQueryKeyOf(id),
		queryFn: () => commands.getProblem(id),
	})
}

export function fetchProblem(client: QueryClient, problemID: string) {
	return client.fetchQuery({
		queryKey: problemQueryKeyOf(problemID),
		queryFn: () => commands.getProblem(problemID),
	})
}
