import type { Problem, TestCase } from "@/lib/client"
import type { OpenedTab } from "@/stores/tab-slice"
import { debounce } from "lodash/fp"
import {
	LucideBugPlay,
	LucidePlay,
	LucidePlus,
	LucideTrash,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "react-toastify"
import { match, P } from "ts-pattern"
import { CodeEditor } from "@/components/editor"
import { ErrorLabel } from "@/components/error-label"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useProblem } from "@/hooks/use-problem"
import { useTestcaseCreator } from "@/hooks/use-testcase-creator"
import { useTestcases } from "@/hooks/use-testcases"
import { cn } from "@/lib/utils"
import { editorPageDataSchema } from "../editor/schema"

interface TestcaseContentProps {
	tab: OpenedTab
}
export function TestcaseContent({ tab }: TestcaseContentProps) {
	const problemTabData = editorPageDataSchema.parse(tab.data)
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
function TestcaseList({ problem, testcases }: TestcaseListProps) {
	const testcaseCreateMutation = useTestcaseCreator()

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

	return (
		<div className="flex h-full flex-col p-2 pr-0" ref={panelRef}>
			<ScrollArea className="min-h-0 flex-1">
				<div className="mr-2 p-2">
					<div className="sticky top-0 mb-4 flex flex-wrap gap-0.5 rounded-md border bg-background p-2">
						{testcases.map(testcase => (
							<span
								className="size-4 rounded-sm border bg-gray-100 transition-colors"
								key={testcase.id}
								title={`Testcase #${testcase.id}`}
							/>
						))}
					</div>

					<ul className="space-y-4">
						{testcases.map((testcase, index) => (
							<li
								key={testcase.id}
								className="rounded-lg border p-4 shadow-sm transition-shadow hover:shadow"
							>
								<div
									className={cn("grid gap-4", {
										"grid-cols-1": colsNum === 1,
										"grid-cols-2": colsNum === 2,
										"grid-cols-3": colsNum === 3,
									})}
								>
									<div className="flex flex-col space-y-2">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">
												Input #
												{index}
											</span>
										</div>
										<div className="flex-1 overflow-hidden rounded-md border">
											<CodeEditor
												className="size-full min-h-32"
												documentID={testcase.input_document_id}
												language="Text"
												textarea
											/>
										</div>
									</div>

									<div className="flex flex-col space-y-2">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">
												Answer #
												{index}
											</span>
										</div>
										<div className="flex-1 overflow-hidden rounded-md border">
											<CodeEditor
												className="size-full min-h-32"
												documentID={testcase.answer_document_id}
												language="Text"
												textarea
											/>
										</div>
									</div>

									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">
												Output #
												{index}
											</span>
										</div>
										<textarea
											className="min-h-32 w-full resize-y rounded-md border p-2"
											disabled
											placeholder="Output will appear here..."
										/>
									</div>
									<div className="flex items-center gap-2">
										<Button variant="destructive" size="icon">
											<LucideTrash />
										</Button>
										<Button variant="outline" size="icon">
											<LucidePlay />
										</Button>
										<Button variant="outline" size="icon">
											<LucideBugPlay />
										</Button>
									</div>
								</div>
							</li>
						))}
					</ul>
				</div>
			</ScrollArea>
			<div className="flex shrink-0 justify-end gap-2 border-t bg-background p-4">
				<Button variant="outline" onClick={handleCreateTestcase}>
					<LucidePlus />
				</Button>
				<Button>Run All</Button>
			</div>
		</div>
	)
}
