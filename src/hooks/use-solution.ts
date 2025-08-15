import { useQuery } from "@tanstack/react-query"
import { commands } from "@/lib/client"
import { problemQueryKeyOf } from "./use-problem"

export function useSolution(solutionID: string, problemID: string) {
	return useQuery({
		queryKey: problemQueryKeyOf(problemID).concat(solutionID),
		queryFn: () => commands.getSolution(solutionID),
	})
}
