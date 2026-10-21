import type { Problem } from "@/lib/client"
import { LucideChevronRight } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "react-toastify"
import { ProblemSetting } from "@/components/problem-setting"
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
import { buttonVariants } from "@/components/ui/button"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { useProblemChangeset } from "@/hooks/use-problem-changeset"
import { useProblemDeleter } from "@/hooks/use-problem-deleter"
import { useSolutionCreator } from "@/hooks/use-solution-creator"
import { algorimejo } from "@/lib/algorimejo"
import { cn } from "@/lib/utils"
import { getSolutionTabTitle } from "../editor/title"
import { ProblemDetail } from "./problem-detail"
import { ProblemListItem } from "./problem-list-item"
import { RenameInput } from "./rename-input"

interface ProblemCollapsibleProps {
	problem: Problem
	onOpenChange: (value: boolean) => void
	open: boolean
}

export function ProblemCollapsible({
	problem,
	onOpenChange,
	open,
}: ProblemCollapsibleProps) {
	const [isRenaming, setIsRenaming] = useState(false)
	const [isEditingOptions, setIsEditingOptions] = useState(false)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
	const keepFocusOnCloseRef = useRef(false)
	const problemDeleteMutation = useProblemDeleter()
	const problemChangesetMutation = useProblemChangeset()
	const solutionCreateMutation = useSolutionCreator()

	function handleDeleteProblem() {
		problemDeleteMutation.mutate(problem.id, {
			onError: (error) => {
				toast.error(`Failed to delete: ${error.message ?? error}`)
			},
			onSuccess: () => {
				for (const sol of problem.solutions) {
					const tabID = algorimejo.findSolutionTabID(sol.id)
					if (tabID) {
						algorimejo.tab.removeTabByID(tabID)
					}
				}
			},
		})
	}
	function handleCreateSolution() {
		solutionCreateMutation.mutate({
			problemId: problem.id,
			params: {
				name: "New Solution",
				author: null,
				language: "cpp",
				content: null,
			},
		}, {
			onSuccess: () => onOpenChange(true),
			onError: error => toast.error(`Failed to create solution: ${error}`),
		})
	}
	function handleProblemRename(newName: string) {
		problemChangesetMutation.mutate(
			{
				id: problem.id,
				changeset: {
					name: newName,
					url: null,
					group: null,
					statement: null,
					checker_id: null,
					time_limit: null,
					memory_limit: null,
				},
			},
			{
				onError: (error) => {
					toast.error(`Failed to rename: ${error}`)
				},
				onSuccess: async () => {
					for (const sol of problem.solutions) {
						const tabID = algorimejo.findSolutionTabID(sol.id)
						if (tabID) {
							algorimejo.tab.renameTab(
								tabID,
								getSolutionTabTitle(sol.name, newName),
							)
						}
					}
				},
			},
		)
	}

	return (
		<Collapsible
			className="select-none"
			onOpenChange={onOpenChange}
			open={open}
		>
			<Dialog open={isEditingOptions} onOpenChange={setIsEditingOptions}>
				<DialogContent>
					<ProblemSetting
						problemID={problem.id}
						onCancel={() => setIsEditingOptions(false)}
						onSubmitCompleted={() => setIsEditingOptions(false)}
					/>
				</DialogContent>
			</Dialog>

			{/* Kept outside the context menu, otherwise it unmounts as soon as the menu closes */}
			<AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete problem?</AlertDialogTitle>
						<AlertDialogDescription>
							"
							{problem.name}
							" will be permanently deleted together with its
							{" "}
							{problem.solutions.length}
							{" "}
							{problem.solutions.length === 1 ? "solution" : "solutions"}
							{" "}
							and all testcases. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							onClick={handleDeleteProblem}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<ContextMenu key={problem.id}>
				{isRenaming
					? (
							<div className="flex w-full items-center gap-1 py-0.5 text-sm">
								<LucideChevronRight className={cn("size-4 shrink-0 text-muted-foreground", { "rotate-90": open })} />
								<RenameInput
									defaultValue={problem.name}
									onCommit={handleProblemRename}
									onDone={() => setIsRenaming(false)}
								/>
							</div>
						)
					: (
							<Tooltip delayDuration={600}>
								<ContextMenuTrigger asChild>
									<CollapsibleTrigger
										className="flex w-full items-center gap-1 rounded-sm text-sm outline-none hover:bg-secondary focus-visible:ring-1 focus-visible:ring-ring"
										asChild
									>
										<TooltipTrigger className="flex items-center justify-start py-0.5">
											<LucideChevronRight
												className={cn("size-4 shrink-0 text-muted-foreground transition-transform", { "rotate-90": open })}
											/>
											<span className="flex-1 truncate text-left">
												{problem.name}
											</span>
											<span className="pr-1 text-xs text-muted-foreground tabular-nums">
												{problem.solutions.length}
											</span>
										</TooltipTrigger>
									</CollapsibleTrigger>
								</ContextMenuTrigger>
								<TooltipContent side="right" align="start">
									<ProblemDetail problem={problem} />
								</TooltipContent>
							</Tooltip>
						)}
				<ContextMenuContent
					onCloseAutoFocus={(e) => {
						if (keepFocusOnCloseRef.current) {
							e.preventDefault()
							keepFocusOnCloseRef.current = false
						}
					}}
				>
					<ContextMenuItem onClick={handleCreateSolution}>
						New Solution
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={() => setIsEditingOptions(true)}>Options...</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={() => {
							keepFocusOnCloseRef.current = true
							setIsRenaming(true)
						}}
					>
						Rename
					</ContextMenuItem>
					<ContextMenuItem variant="destructive" onClick={() => setIsConfirmingDelete(true)}>
						Delete...
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<CollapsibleContent asChild>
				<ul>
					{problem.solutions.map(solution => (
						<ProblemListItem
							key={solution.id}
							solution={solution}
							problem={problem}
							className="text-sm"
						/>
					))}
				</ul>
			</CollapsibleContent>
		</Collapsible>
	)
}
