import type { CodeMirrorTextareaRef } from "@/components/editor/textarea"
import type { TestCase } from "@/lib/client"
import type { RunTestResultStatus } from "@/lib/runner"
import { LucideBugPlay, LucidePlay, LucideTrash } from "lucide-react"
import { forwardRef, useImperativeHandle, useRef } from "react"
import { CodeEditor } from "@/components/editor"
import { CodeMirrorTextarea } from "@/components/editor/textarea"
import { Button } from "@/components/ui/button"
import { runTestStatusToColor } from "@/lib/runner"
import { cn } from "@/lib/utils"

interface TestcaseItemProps {
	testcase: TestCase
	index: number
	colsNum: number
	status: RunTestResultStatus
	onRunTestcase?: (testcase: TestCase) => void
}
export interface TestcaseItemRef {
	appendOutput: (output: string) => void
	clearOutput: () => void
}

export const TestcaseItem = forwardRef<TestcaseItemRef, TestcaseItemProps>(
	({ testcase, colsNum, index, status, onRunTestcase }, ref) => {
		const outputRef = useRef<CodeMirrorTextareaRef | null>(null)

		useImperativeHandle(ref, () => ({
			appendOutput: (output: string) => {
				if (outputRef.current) {
					outputRef.current.append(output)
				}
			},
			clearOutput: () => {
				if (outputRef.current) {
					outputRef.current.clear()
				}
			},
		}))

		return (
			<li className="rounded-lg border p-3 shadow-sm transition-shadow hover:shadow">
				<div className="mb-3 flex flex-col gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-base font-semibold">
							Testcase #
							{index + 1}
						</h3>
						<div
							className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
							style={{ backgroundColor: runTestStatusToColor[status] }}
						>
							{status}
						</div>
					</div>

					<div className="flex items-center gap-1">
						<Button variant="destructive" size="sm" className="h-7 w-7 p-0">
							<LucideTrash className="h-3 w-3" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 w-7 p-0"
							onClick={() => onRunTestcase?.(testcase)}
						>
							<LucidePlay className="h-3 w-3" />
						</Button>
						<Button variant="outline" size="sm" className="h-7 w-7 p-0">
							<LucideBugPlay className="h-3 w-3" />
						</Button>
					</div>
				</div>

				<div
					className={cn("grid gap-3", {
						"grid-cols-1": colsNum === 1,
						"grid-cols-2": colsNum === 2,
						"grid-cols-3": colsNum === 3,
					})}
				>
					<div className="flex flex-col space-y-1.5">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-muted-foreground">Input</span>
						</div>
						<div className="flex-1 overflow-hidden rounded-md border">
							<CodeEditor
								className="size-full min-h-24"
								documentID={testcase.input_document_id}
								language="Text"
								textarea
							/>
						</div>
					</div>

					<div className="flex flex-col space-y-1.5">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-muted-foreground">Answer</span>
						</div>
						<div className="flex-1 overflow-hidden rounded-md border">
							<CodeEditor
								className="size-full min-h-24"
								documentID={testcase.answer_document_id}
								language="Text"
								textarea
							/>
						</div>
					</div>

					<div className="flex flex-col space-y-1.5">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-muted-foreground">Output</span>
						</div>
						<div className="flex-1 overflow-hidden rounded-md border">
							<CodeMirrorTextarea
								className="size-full min-h-24"
								ref={outputRef}
								editable={false}
								defaultValue=""
							/>
						</div>
					</div>
				</div>
			</li>
		)
	},
)
