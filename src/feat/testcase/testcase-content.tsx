import type { TestcaseItemRef } from "./testcase-item"
import type { Problem, TestCase } from "@/lib/client"
import type { RunTestResultStatus } from "@/lib/runner"
import type { OpenedTab } from "@/stores/tab-slice"
import * as log from "@tauri-apps/plugin-log"
import { debounce } from "lodash/fp"
import {
	LucidePlus,
	LucideSettings,
} from "lucide-react"
import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { toast } from "react-toastify"
import { match, P } from "ts-pattern"
import { ErrorLabel } from "@/components/error-label"
import { ProblemSetting } from "@/components/problem-setting"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useLanguage } from "@/hooks/use-language"
import { useProblem } from "@/hooks/use-problem"
import { useSolution } from "@/hooks/use-solution"
import { useTestcaseCreator } from "@/hooks/use-testcase-creator"
import { useTestcases } from "@/hooks/use-testcases"
import { runTestcase, runTestStatusToColor } from "@/lib/runner"
import { solutionEditorPageDataSchema } from "../editor/schema"
import { TestcaseItem } from "./testcase-item"

interface TestcaseContentProps {
	tab: OpenedTab
}
export function TestcaseContent({ tab }: TestcaseContentProps) {
	const problemTabData = solutionEditorPageDataSchema.parse(tab.data)
	const problemQuery = useProblem(problemTabData.problemID)
	const testcasesQuery = useTestcases(problemTabData.problemID)

	return (
		<div className="flex min-h-0 flex-col select-none" key={tab.id}>
			<div className="h-6 truncate border-b px-2 text-sm font-medium">
				Test:
				{" "}
				{tab.title}
			</div>

			<div className="min-h-0 flex-1">
				{match({
					problemQuery,
					testcasesQuery,
				})
					.with(
						P.union(
							{ problemQuery: { status: "pending" } },
							{ testcasesQuery: { status: "pending" } },
						),
						() => <TestcaseSkeleton />,
					)
					.with(
						{
							problemQuery: { status: "success" },
							testcasesQuery: { status: "success" },
						},
						data => (
							<TestcaseList
								problem={data.problemQuery.data}
								solutionID={problemTabData.solutionID}
								testcases={data.testcasesQuery.data}
							/>
						),
					)
					.with({ problemQuery: { status: "error" } }, error => (
						<ErrorLabel message={error.problemQuery.error.message} />
					))
					.with({ testcasesQuery: { status: "error" } }, error => (
						<ErrorLabel message={error.testcasesQuery.error.message} />
					))
					.exhaustive()}
			</div>
		</div>
	)
}

function TestcaseSkeleton() {
	return (
		<>
			<div className="flex gap-2">
				<Skeleton className="h-8 flex-1" />
				<Skeleton className="size-8" />
			</div>
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
		</>
	)
}

interface TestcaseListProps {
	problem: Problem
	testcases: TestCase[]
	solutionID: string
}
function TestcaseList({ problem, testcases, solutionID }: TestcaseListProps) {
	const testcaseCreateMutation = useTestcaseCreator()
	const [isEditingProblemOptions, setIsEditingProblemOptions] = useState(false)

	const [itemsStatus, dispatchItemsStatus] = useReducer((state: RunTestResultStatus[], action: { type: "set", index: number, status: RunTestResultStatus } | { type: "reset", length: number }) => {
		return match(action)
			.with({ type: "set" }, (action) => {
				const newState = [...state]
				newState[action.index] = action.status
				return newState
			})
			.with({ type: "reset" }, (action) => {
				return Array.from({ length: action.length }, () => "UNRUN" as RunTestResultStatus)
			})
			.exhaustive()
	}, testcases.map(() => "UNRUN" as RunTestResultStatus))
	const itemsRef = useRef<TestcaseItemRef[]>([])

	useEffect(() => {
		itemsRef.current = itemsRef.current.slice(0, testcases.length)
		dispatchItemsStatus({ type: "reset", length: testcases.length })
	}, [testcases])

	const panelRef = useRef<HTMLDivElement>(null)
	const [colsNum, setColsNum] = useState(1)

	useEffect(() => {
		if (!panelRef.current)
			return
		const panel = panelRef.current
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0]
			if (entry) {
				setColsNum(Math.min(Math.floor(entry.contentRect.width / 200), 3))
			}
		})
		observer.observe(panel)
		return () => observer.disconnect()
	}, [])

	const handleCreateTestcase = debounce(
		400,
		useCallback(() => {
			testcaseCreateMutation.mutate(problem.id, {
				onError: (error) => {
					if (error instanceof Error) {
						toast.error(error.message)
					}
					else {
						toast.error(error)
					}
				},
			})
		}, [testcaseCreateMutation, problem.id]),
	)
	const solution = useSolution(solutionID, problem.id)
	const languageItem = useLanguage({
		enabled: !!solution.data,
		language: solution.data?.language,
	})

	const handleRunTestcase = useCallback(async (testcase: TestCase, index: number) => {
		if (!solution.data) {
			toast.error("Solution is not loaded, please wait for a moment. If it still not loaded, please report this issue.")
			return
		}
		if (!languageItem.data) {
			toast.error("Language is not loaded, please wait for a moment. If it still not loaded, please report this issue.")
			return
		}
		const tag = `tt-${testcase.id}`
		dispatchItemsStatus({ type: "set", index, status: "PD" })
		itemsRef.current[index]?.clearOutput()
		const info = await runTestcase({
			tag,
			testcaseInputDocID: testcase.input_document_id,
			testcaseOutputDocID: testcase.answer_document_id,
			solutionDocID: solution.data.document!.id,
			checkerName: problem.checker ?? "ncmp",
			language: languageItem.data,
			compileTimeout: problem.time_limit,
			runTimeout: problem.time_limit,
			programOutputListener: (line, ty) => {
				if (ty === "stdout") {
					itemsRef.current[index]?.appendOutput(line)
				}
			},
		})
		dispatchItemsStatus({ type: "set", index, status: info.result })
		log.trace(`testcase ${tag} result: ${JSON.stringify(info)}`)
	}, [languageItem.data, problem.checker, problem.time_limit, solution.data])

	const handleRunAllTestcases = useCallback(() => {
		for (let i = 0; i < testcases.length; i++) {
			handleRunTestcase(testcases[i], i)
		}
	}, [handleRunTestcase, testcases])

	return (
		<div className="flex h-full flex-col p-2 pr-0" ref={panelRef}>
			<Dialog open={isEditingProblemOptions} onOpenChange={setIsEditingProblemOptions}>
				<DialogContent>
					<ProblemSetting
						problemID={problem.id}
						onCancel={() => setIsEditingProblemOptions(false)}
						onSubmitCompleted={() => setIsEditingProblemOptions(false)}
					/>
				</DialogContent>
			</Dialog>

			<ScrollArea className="min-h-0 flex-1">
				<div className="mr-2 p-2">

					<ul className="space-y-4">
						{testcases.map((testcase, index) => (
							<TestcaseItem
								ref={el => itemsRef.current[index] = el!}
								testcase={testcase}
								colsNum={colsNum}
								index={index}
								key={testcase.id}
								status={itemsStatus[index]}
								onRunTestcase={testcase => handleRunTestcase(testcase, index)}
							/>
						))}
					</ul>
				</div>
			</ScrollArea>
			<div className="flex shrink-0 justify-end gap-2 border-t bg-background p-4">
				<div className="mb-4 flex gap-2">
					<div className="flex flex-1 flex-wrap gap-0.5 rounded-md border bg-background p-2">
						{testcases.map((testcase, index) => (
							<span
								className="size-4 cursor-pointer rounded-sm border transition-colors"
								style={{ backgroundColor: runTestStatusToColor[itemsStatus[index]] }}
								key={testcase.id}
								title={`Testcase #${index + 1}: ${itemsStatus[index]}`}
							/>
						))}
					</div>
				</div>
				<span className="flex-1" />
				<Button variant="outline" size="icon" onClick={() => setIsEditingProblemOptions(true)}>
					<LucideSettings />
				</Button>
				<Button variant="outline" onClick={handleCreateTestcase}>
					<LucidePlus />
				</Button>
				<Button onClick={handleRunAllTestcases}>Run All</Button>
			</div>
		</div>
	)
}
