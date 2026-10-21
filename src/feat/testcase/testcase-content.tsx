import type { TestcaseItemRef } from "./testcase-item"
import type { TabInstance } from "@/lib/algorimejo/tab-manager"
import type { Problem, TestCase } from "@/lib/client"
import type { RunTestResultStatus } from "@/lib/runner"
import * as log from "@tauri-apps/plugin-log"
import { debounce } from "lodash/fp"
import {
	LucideChevronDown,
	LucideFlaskConical,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLanguage } from "@/hooks/use-language"
import { useProblem } from "@/hooks/use-problem"
import { useSolution } from "@/hooks/use-solution"
import { useTestcaseCreator } from "@/hooks/use-testcase-creator"
import { useTestcaseDeleter } from "@/hooks/use-testcase-deleter"
import { useTestcases } from "@/hooks/use-testcases"
import { algorimejo } from "@/lib/algorimejo"
import { getRunTestMessage, runProgramDetached, runTestcase, runTestStatusToColor, runTestStatusToLabel } from "@/lib/runner"
import { shortcuts } from "@/lib/shortcuts"
import { solutionEditorPageDataSchema } from "../editor/schema"
import { TestcaseItem } from "./testcase-item"

interface TestcaseContentProps {
	tab: TabInstance
}
export function TestcaseContent({ tab }: TestcaseContentProps) {
	const problemTabData = solutionEditorPageDataSchema.parse(tab.data)
	const problemQuery = useProblem(problemTabData.problemID)
	const testcasesQuery = useTestcases(problemTabData.problemID)

	return (
		<div className="flex min-h-0 flex-col select-none" key={tab.id}>
			<div className="flex h-7 shrink-0 items-center border-b px-2 text-sm" title={tab.title}>
				<span className="mr-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tests</span>
				<span className="truncate">{tab.title}</span>
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
		<div className="space-y-2 p-2">
			<div className="flex gap-2">
				<Skeleton className="h-8 flex-1" />
				<Skeleton className="size-8" />
			</div>
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
		</div>
	)
}

interface TestcaseListProps {
	problem: Problem
	testcases: TestCase[]
	solutionID: string
}
function TestcaseList({ problem, testcases, solutionID }: TestcaseListProps) {
	const testcaseCreateMutation = useTestcaseCreator()
	const testcaseDeleteMutation = useTestcaseDeleter()
	const [isEditingProblemOptions, setIsEditingProblemOptions] = useState(false)
	const [isRunning, setIsRunning] = useState(false)
	const runLockRef = useRef(false)

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
	const [runMessages, setRunMessages] = useState<Record<string, string>>({})
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
				setColsNum(Math.max(1, Math.min(Math.floor(entry.contentRect.width / 200), 3)))
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

	const executeTestcase = useCallback(async (testcase: TestCase, index: number, tag: string) => {
		if (!solution.data) {
			toast.error("Solution is not loaded, please wait for a moment. If it still not loaded, please report this issue.")
			return false
		}
		if (!languageItem.data) {
			toast.error("Language is not loaded, please wait for a moment. If it still not loaded, please report this issue.")
			return false
		}
		dispatchItemsStatus({ type: "set", index, status: "PD" })
		setRunMessages(current => ({ ...current, [testcase.id]: "" }))
		itemsRef.current[index]?.clearOutput()
		const info = await runTestcase({
			tag,
			testcaseInputDocID: testcase.input_document_id,
			testcaseOutputDocID: testcase.answer_document_id,
			solutionDocID: solution.data.document!.id,
			problemID: problem.id,
			checkerID: problem.checker.id,
			language: languageItem.data,
			runTimeout: problem.time_limit,
			programOutputListener: (line, ty) => {
				if (ty === "stdout") {
					itemsRef.current[index]?.appendOutput(`${line}\n`)
				}
			},
		})
		dispatchItemsStatus({ type: "set", index, status: info.result })
		const message = getRunTestMessage(info)
		if (message)
			setRunMessages(current => ({ ...current, [testcase.id]: message }))
		log.trace(`testcase ${tag} result: ${JSON.stringify(info)}`)
		return true
	}, [languageItem.data, problem.checker.id, problem.id, problem.time_limit, solution.data])

	const beginRun = useCallback(() => {
		if (runLockRef.current)
			return false

		runLockRef.current = true
		setIsRunning(true)
		return true
	}, [])

	const endRun = useCallback(() => {
		runLockRef.current = false
		setIsRunning(false)
	}, [])

	const handleRunTestcase = useCallback(async (testcase: TestCase, index: number) => {
		if (!beginRun())
			return

		try {
			await executeTestcase(testcase, index, `tt-${testcase.id}`)
		}
		finally {
			endRun()
		}
	}, [beginRun, endRun, executeTestcase])

	const handleRunAllTestcases = useCallback(async () => {
		if (!beginRun())
			return

		try {
			const tag = `tta-${solutionID}`
			for (let i = 0; i < testcases.length; i++) {
				const didRun = await executeTestcase(testcases[i], i, tag)
				if (!didRun)
					break
			}
		}
		finally {
			endRun()
		}
	}, [beginRun, endRun, executeTestcase, solutionID, testcases])

	// Triggered by the global "run all testcases" shortcut
	useEffect(() => {
		const handler = () => {
			void handleRunAllTestcases()
		}
		algorimejo.events.on("runAllTestcasesRequested", handler)
		return () => algorimejo.events.off("runAllTestcasesRequested", handler)
	}, [handleRunAllTestcases])

	const handleDeleteTestcase = useCallback((testcase: TestCase) => {
		testcaseDeleteMutation.mutate(testcase.id, {
			onError: error => toast.error(`Failed to delete testcase: ${error instanceof Error ? error.message : error}`),
		})
	}, [testcaseDeleteMutation])

	const finishedCount = itemsStatus.filter(status => status !== "UNRUN" && status !== "PD").length
	const acceptedCount = itemsStatus.filter(status => status === "AC").length

	const handleRunTestcaseDetached = useCallback(async () => {
		if (!beginRun())
			return

		try {
			if (!solution.data) {
				toast.error("Solution is not loaded, please wait for a moment. If it still not loaded, please report this issue.")
				return
			}
			if (!languageItem.data) {
				toast.error("Language is not loaded, please wait for a moment. If it still not loaded, please report this issue.")
				return
			}
			const tag = `sol-${solution.data.id}`
			const info = await runProgramDetached({
				tag,
				solutionDocID: solution.data.document!.id,
				language: languageItem.data,
			})
			log.trace(`run (detached) ${tag} result: ${JSON.stringify(info)}`)
		}
		catch (error) {
			toast.error(error instanceof Error ? error.message : String(error))
		}
		finally {
			endRun()
		}
	}, [beginRun, endRun, languageItem.data, solution.data])
	return (
		<div className="flex h-full flex-col" ref={panelRef}>
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
					{testcases.length === 0
						? (
								<div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
									<LucideFlaskConical className="size-8 opacity-50" />
									<p>No testcases yet. Add one to start checking your solution.</p>
									<Button size="sm" onClick={handleCreateTestcase}>
										<LucidePlus />
										Add Testcase
									</Button>
								</div>
							)
						: (
								<ul className="space-y-4">
									{testcases.map((testcase, index) => (
										<TestcaseItem
											ref={el => itemsRef.current[index] = el!}
											testcase={testcase}
											colsNum={colsNum}
											index={index}
											key={testcase.id}
											status={itemsStatus[index] ?? "UNRUN"}
											message={runMessages[testcase.id]}
											disabled={isRunning}
											onRunTestcase={testcase => handleRunTestcase(testcase, index)}
											onDeleteTestcase={handleDeleteTestcase}
										/>
									))}
								</ul>
							)}
				</div>
			</ScrollArea>
			<div className="shrink-0 space-y-2 border-t bg-background p-2">
				{testcases.length > 0 && (
					<div className="flex items-center gap-2">
						<div className="flex flex-1 flex-wrap gap-1">
							{testcases.map((testcase, index) => {
								const status = itemsStatus[index] ?? "UNRUN"
								return (
									<button
										type="button"
										className="size-4 rounded-sm border outline-none focus-visible:ring-2 focus-visible:ring-ring"
										style={{ backgroundColor: runTestStatusToColor[status] }}
										key={testcase.id}
										title={`Testcase #${index + 1}: ${runTestStatusToLabel[status]}`}
										aria-label={`Go to testcase #${index + 1}: ${runTestStatusToLabel[status]}`}
										onClick={() => itemsRef.current[index]?.scrollIntoView()}
									/>
								)
							})}
						</div>
						{finishedCount > 0 && (
							<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
								{acceptedCount}
								/
								{testcases.length}
								{" "}
								passed
							</span>
						)}
					</div>
				)}
				<div className="flex flex-wrap items-center gap-2">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="outline" size="icon" aria-label="Problem settings" onClick={() => setIsEditingProblemOptions(true)}>
								<LucideSettings />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Problem settings (checker, limits)</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="outline" size="icon" aria-label="Add testcase" onClick={handleCreateTestcase}>
								<LucidePlus />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Add testcase</TooltipContent>
					</Tooltip>
					<span className="flex-1" />
					<span className="flex">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button onClick={handleRunAllTestcases} className="rounded-r-none" disabled={isRunning || testcases.length === 0}>
									{isRunning ? "Running..." : "Run All"}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{testcases.length === 0 ? "Add a testcase first" : `Run all testcases (${shortcuts.runAllTestcases.label})`}
							</TooltipContent>
						</Tooltip>
						<DropdownMenu>
							<DropdownMenuTrigger
								disabled={isRunning}
								aria-label="More run options"
								className="inline-flex h-9 w-auto shrink-0 items-center justify-center rounded-md rounded-l-none border-l border-primary-foreground/20 bg-primary px-1.5 py-2 text-sm font-medium whitespace-nowrap text-primary-foreground shadow-xs transition-all outline-none hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
							>
								<LucideChevronDown />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={handleRunTestcaseDetached}>
									Run Interactively
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</span>
				</div>
			</div>
		</div>
	)
}
