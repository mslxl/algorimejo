import { useQuery } from "@tanstack/react-query"
import { commands } from "@/lib/client"

export function testcaseQueryKeyOf(problemID: string) {
	return ["testcases", problemID]
}

export function useTestcases(problemID: string) {
	return useQuery({
		queryKey: testcaseQueryKeyOf(problemID),
		queryFn: () => commands.getTestcases(problemID),
	})
}
