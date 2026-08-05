import type { CreateCheckerParams, UpdateCheckerParams, UpsertCheckerSelfTestParams } from "@/lib/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { commands } from "@/lib/client"
import { CHECKERS_QUERY_KEY } from "./use-checker-names"
import { problemQueryKeyOf } from "./use-problem"
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list"

export function checkerQueryKey(checkerID: string) {
	return ["checker", checkerID]
}

export function useChecker(checkerID: string) {
	return useQuery({
		queryKey: checkerQueryKey(checkerID),
		queryFn: () => commands.getChecker(checkerID),
	})
}

export function useCheckerEditorInfo(checkerID: string, enabled = true) {
	return useQuery({
		queryKey: checkerQueryKey(checkerID).concat("editor"),
		queryFn: () => commands.getCheckerEditorInfo(checkerID),
		enabled,
	})
}

export function useCheckerSelfTests(checkerID: string) {
	return useQuery({
		queryKey: checkerQueryKey(checkerID).concat("self-tests"),
		queryFn: () => commands.getCheckerSelfTests(checkerID),
	})
}

function invalidateCheckers(queryClient: ReturnType<typeof useQueryClient>, checkerID?: string, problemID?: string | null) {
	queryClient.invalidateQueries({ queryKey: CHECKERS_QUERY_KEY })
	queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
	if (checkerID)
		queryClient.invalidateQueries({ queryKey: checkerQueryKey(checkerID) })
	if (problemID)
		queryClient.invalidateQueries({ queryKey: problemQueryKeyOf(problemID) })
}

export function useCheckerCreator() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: CreateCheckerParams) => commands.createChecker(params),
		onSuccess: result => invalidateCheckers(queryClient, result.checker.id, result.checker.owner_problem_id),
	})
}

export function useCheckerUpdater(checkerID: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: UpdateCheckerParams) => commands.updateChecker(checkerID, params),
		onSuccess: checker => invalidateCheckers(queryClient, checker.id, checker.owner_problem_id),
	})
}

export function useCheckerDeleter() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (checkerID: string) => commands.deleteChecker(checkerID),
		onSuccess: () => invalidateCheckers(queryClient),
	})
}

export function useProblemCheckerSetter(problemID: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (checkerID: string) => commands.setProblemChecker(problemID, checkerID),
		onSuccess: () => invalidateCheckers(queryClient, undefined, problemID),
	})
}

export function useCheckerSelfTestUpserter(checkerID: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (params: UpsertCheckerSelfTestParams) => commands.upsertCheckerSelfTest(params),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: checkerQueryKey(checkerID).concat("self-tests") }),
	})
}

export function useCheckerSelfTestDeleter(checkerID: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (selfTestID: string) => commands.deleteCheckerSelfTest(selfTestID),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: checkerQueryKey(checkerID).concat("self-tests") }),
	})
}
