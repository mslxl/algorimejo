import type { CreateProblemParams } from "@/lib/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { toast } from "react-toastify"
import { getSolutionTabTitle } from "@/feat/editor/title"
import { algorimejo } from "@/lib/algorimejo"
import { commands } from "@/lib/client"
import { PROBLEMS_LIST_QUERY_KEY } from "./use-problems-list"

export function useProblemCreator() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (params: CreateProblemParams) => {
			return await commands.createProblem(params)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
		},
	})
}

const DEFAULT_PROBLEM_NAME = "Unnamed Problem"

/**
 * "Unnamed Problem", then "Unnamed Problem 2", "Unnamed Problem 3"... so new problems can be told apart
 */
async function nextDefaultProblemName() {
	const { problems } = await commands.getProblems({
		cursor: null,
		limit: 100,
		search: DEFAULT_PROBLEM_NAME,
		sort_by: null,
		sort_order: null,
	})
	const taken = new Set(problems.map(problem => problem.name))
	if (!taken.has(DEFAULT_PROBLEM_NAME))
		return DEFAULT_PROBLEM_NAME
	let index = 2
	while (taken.has(`${DEFAULT_PROBLEM_NAME} ${index}`))
		index++
	return `${DEFAULT_PROBLEM_NAME} ${index}`
}

export function useDefaultProblemCreator() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async () => {
			const params = await commands.getDefaultCreateProblemParams(await nextDefaultProblemName(), null, null, null)
			return await commands.createProblem(params)
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
		},
	})
}

/**
 * Create a problem with default params, then open its first solution and reveal it in the file browser
 */
export function useCreateAndOpenProblem() {
	const mutation = useDefaultProblemCreator()
	const create = useCallback(() => {
		mutation.mutate(undefined, {
			onError: (error) => {
				// Tauri errors are strings, not objects with message property
				const errorMessage
					= typeof error === "string"
						? error
						: error?.message || "An error occurred"
				toast.error(`Failed to create problem: ${errorMessage}`)
			},
			onSuccess: ({ problem }) => {
				const solution = problem.solutions[0]
				if (!solution?.document) {
					toast.error(`Problem "${problem.name}" was created without a solution document. Please report this issue.`)
					return
				}
				algorimejo.dock.select(null, "file-browser")
				algorimejo.openSolutionTab({
					problemID: problem.id,
					solutionID: solution.id,
					title: getSolutionTabTitle(solution.name, problem.name),
					reuse: true,
				})
			},
		})
	}, [mutation])
	return { create, isPending: mutation.isPending }
}
