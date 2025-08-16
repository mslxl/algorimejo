import { useQuery } from "@tanstack/react-query"
import { commands } from "@/lib/client"

export function useCheckerNames() {
	return useQuery({
		queryKey: ["checkers"],
		queryFn: () => commands.getCheckersName(),
	})
}
