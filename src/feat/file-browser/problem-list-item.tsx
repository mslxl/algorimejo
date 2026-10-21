import type { HTMLAttributes } from "react"
import type { Problem, Solution } from "@/lib/client"
import * as log from "@tauri-apps/plugin-log"
import { useRef, useState } from "react"
import { toast } from "react-toastify"
import { SolutionSetting } from "@/components/solution-setting"
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
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSolutionChangeset } from "@/hooks/use-solution-changeset"
import { useSolutionDeleter } from "@/hooks/use-solution-deleter"
import { algorimejo } from "@/lib/algorimejo"
import { useObservable } from "@/lib/observable"
import { cn } from "@/lib/utils"
import { solutionEditorPageDataSchema } from "../editor/schema"
import { getSolutionTabTitle } from "../editor/title"
import { RenameInput } from "./rename-input"
import { TreeStyledLi } from "./tree-styled-item"

interface ProblemListItemProps extends HTMLAttributes<HTMLLIElement> {
	solution: Solution
	problem: Problem
}
export function ProblemListItem({
	solution,
	problem,
	className,
	...props
}: ProblemListItemProps) {
	const [isRenaming, setIsRenaming] = useState(false)
	const [isEditingOptions, setIsEditingOptions] = useState(false)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
	const keepFocusOnCloseRef = useRef(false)
	const solutionChangesetMutation = useSolutionChangeset()
	const solutionDeleterMutation = useSolutionDeleter()

	const selectedTab = useObservable(algorimejo.tab.selectedTab)
	const isActive = selectedTab?.key === "solution-editor"
		&& solutionEditorPageDataSchema.safeParse(selectedTab.data).data?.solutionID === solution.id

	function handleSolutionRename(newName: string) {
		solutionChangesetMutation.mutate(
			{
				id: solution.id,
				problemID: solution.problem_id,
				changeset: {
					name: newName,
					author: null,
					language: null,
				},
			},
			{
				onError: (error) => {
					toast.error(`Failed to rename: ${error}`)
				},
				onSuccess: () => {
					const tabID = algorimejo.findSolutionTabID(solution.id)
					if (tabID) {
						algorimejo.tab.renameTab(
							tabID,
							getSolutionTabTitle(newName, problem.name),
						)
					}
				},
			},
		)
	}
	function handleSolutionDelete() {
		solutionDeleterMutation.mutate(solution.id, {
			onError: (error) => {
				toast.error(`Failed to delete: ${error}`)
			},
			onSuccess: () => {
				if (solution.document) {
					const tabID = algorimejo.findSolutionTabID(solution.id)
					if (tabID) {
						algorimejo.tab.removeTabByID(tabID)
					}
				}
			},
		})
	}
	function handleOpenSolution() {
		if (solution.document) {
			algorimejo.openSolutionTab({
				problemID: problem.id,
				solutionID: solution.id,
				title: getSolutionTabTitle(solution.name, problem.name),
				reuse: true,
			})
		}
		else {
			const msg = `Solution ${solution.name} has no document included! This should not happen! Please report this issue to the developer.`

			log.error(msg)
			log.error("Below is the solution data:")
			log.error(JSON.stringify(solution, null, 2))

			toast.error(msg)
		}
	}
	return (
		<TreeStyledLi
			{...props}
			className={cn(className, { "bg-accent text-accent-foreground font-medium": isActive })}
		>
			<Dialog open={isEditingOptions} onOpenChange={setIsEditingOptions}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="select-none">
							Solution Options:
							{" "}
							{solution.name}
							{" "}
							-
							{" "}
							{problem.name}
						</DialogTitle>
					</DialogHeader>
					<SolutionSetting
						solutionID={solution.id}
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
						<AlertDialogTitle>Delete solution?</AlertDialogTitle>
						<AlertDialogDescription>
							"
							{solution.name}
							" and its code will be permanently deleted. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							onClick={handleSolutionDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{isRenaming
				? (
						<RenameInput
							defaultValue={solution.name}
							onCommit={handleSolutionRename}
							onDone={() => setIsRenaming(false)}
						/>
					)
				: (
						<ContextMenu key={solution.id}>
							<ContextMenuTrigger asChild>
								<button
									type="button"
									onClick={handleOpenSolution}
									title={`${solution.name} (${solution.language})`}
									className="size-full truncate py-0.5 text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
								>
									{solution.name}
								</button>
							</ContextMenuTrigger>
							<ContextMenuContent
								onCloseAutoFocus={(e) => {
									if (keepFocusOnCloseRef.current) {
										e.preventDefault()
										keepFocusOnCloseRef.current = false
									}
								}}
							>
								<ContextMenuItem onClick={handleOpenSolution}>Open</ContextMenuItem>
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
					)}
		</TreeStyledLi>
	)
}
