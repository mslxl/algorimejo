import { commands } from "@/lib/client";
import { useQuery } from "@tanstack/react-query";

export function testcaseQueryKeyOf(problemID: string) {
	return ["testcases", problemID];
}

export function useTestcases(problemID: string) {
	return useQuery({
		queryKey: testcaseQueryKeyOf(problemID),
		queryFn: () => commands.getTestcases(problemID),
	});
}
