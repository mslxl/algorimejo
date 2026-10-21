import type { CodeMirrorTextareaRef } from "@/components/editor/textarea"
import type { TestCase } from "@/lib/client"
import type { RunTestResultStatus } from "@/lib/runner"
import { LucideLoader2, LucidePlay, LucideTrash } from "lucide-react"
import { forwardRef, useImperativeHandle, useRef, useState } from "react"
import { CodeEditor } from "@/components/editor"
import { CodeMirrorTextarea } from "@/components/editor/textarea"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { runTestStatusStyle, runTestStatusToBadge, runTestStatusToLabel } from "@/lib/runner"
import { cn } from "@/lib/utils"

interface TestcaseItemProps {
	testcase: TestCase
	index: number
	colsNum: number
	status: RunTestResultStatus
	message?: string
	disabled?: boolean
	onRunTestcase?: (testcase: TestCase) => void
	onDeleteTestcase?: (testcase: TestCase) => void
}
export interface TestcaseItemRef {
	appendOutput: (output: string) => void
	clearOutput: () => void
	scrollIntoView: () => void
}

export const TestcaseItem = forwardRef<TestcaseItemRef, TestcaseItemProps>(
	({ testcase, colsNum, index, status, message, disabled, onRunTestcase, onDeleteTestcase }, ref) => {
		const outputRef = useRef<CodeMirrorTextareaRef | null>(null)
		const itemRef = useRef<HTMLLIElement | null>(null)
		const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

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
			scrollIntoView: () => {
				itemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
			},
		}))

		return (
			<li ref={itemRef} className="rounded-lg border p-3 shadow-sm transition-shadow hover:shadow">
				<AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								Delete testcase #
								{index + 1}
								?
							</AlertDialogTitle>
							<AlertDialogDescription>
								Its input and answer will be permanently deleted.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								className={buttonVariants({ variant: "destructive" })}
								onClick={() => onDeleteTestcase?.(testcase)}
							>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<div className="mb-3 flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<h3 className="text-base font-semibold">
							#
							{index + 1}
						</h3>
						<div
							className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
							style={runTestStatusStyle(status)}
							title={runTestStatusToLabel[status]}
						>
							{status === "PD" && <LucideLoader2 className="size-3 animate-spin" />}
							{runTestStatusToBadge(status)}
						</div>
						<span className="flex-1" />
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									className="size-7"
									aria-label={`Run testcase #${index + 1}`}
									disabled={disabled}
									onClick={() => onRunTestcase?.(testcase)}
								>
									<LucidePlay className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Run this testcase</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7 text-muted-foreground hover:text-destructive"
									aria-label={`Delete testcase #${index + 1}`}
									disabled={disabled}
									onClick={() => setIsConfirmingDelete(true)}
								>
									<LucideTrash className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Delete testcase</TooltipContent>
						</Tooltip>
					</div>
					{message && (
						<pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground select-text">
							{message}
						</pre>
					)}
				</div>

				<div
					className={cn("grid gap-3", {
						"grid-cols-1": colsNum <= 1,
						"grid-cols-2": colsNum === 2,
						"grid-cols-3": colsNum >= 3,
					})}
				>
					<div className="flex flex-col space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">Input</span>
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
						<span className="text-xs font-medium text-muted-foreground">Answer</span>
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
						<span className="text-xs font-medium text-muted-foreground">Output</span>
						<div className="flex-1 overflow-hidden rounded-md border bg-muted/40">
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
