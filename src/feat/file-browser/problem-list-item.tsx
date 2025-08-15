import type { HTMLAttributes } from "react"
import type { Problem, Solution } from "@/lib/client"
import * as log from "@tauri-apps/plugin-log"
import { useRef, useState } from "react"
import { toast } from "react-toastify"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
import { selectEditorDocumentTabIndex } from "../editor/utils"
import { SolutionSetting } from "./solution-setting"
import { TreeStyledLi } from "./tree-styled-item"

interface ProblemListItemProps extends HTMLAttributes<HTMLLIElement> {
	solution: Solution
	problem: Problem
}
export function ProblemListItem({
	solution,
	problem,
	...props
}: ProblemListItemProps) {
	const [isRenaming, setIsRenaming] = useState(false)
	const [isEditingOptions, setIsEditingOptions] = useState(false)
	const solutionChangesetMutation = useSolutionChangeset()
	const solutionDeleterMutation = useSolutionDeleter()
	const inputRenameRef = useRef<HTMLInputElement>(null)

	function handleStartRename() {
		setIsRenaming(true)
		setTimeout(() => {
			inputRenameRef.current?.focus()
		}, 100)
	}
	function handleProblemRename(newName: string) {
		setIsRenaming(false)
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
					toast.error(`Fail to rename: ${error}`)
				},
				onSuccess: () => {
					if (solution.document) {
						const tabIndex = algorimejo.selectStateValue(
							selectEditorDocumentTabIndex(solution.document.id),
						)
						if (tabIndex !== -1) {
							algorimejo.renameTab(tabIndex, `${newName} - ${problem.name}`)
						}
					}
				},
			},
		)
	}
	function handleSolutionDelete() {
		solutionDeleterMutation.mutate(solution.id, {
			onError: (error) => {
				toast.error(`Fail to delete: ${error}`)
			},
			onSuccess: () => {
				if (solution.document) {
					const tabIndex = algorimejo.selectStateValue(
						selectEditorDocumentTabIndex(solution.document.id),
					)
					if (tabIndex !== -1) {
						algorimejo.closeTab(tabIndex)
					}
				}
			},
		})
	}
	function handleOpenSolution() {
		if (solution.document) {
			algorimejo.createSolutionEditorTab(
				solution.id,
				problem.id,
				{
					title: `${solution.name} - ${problem.name}`,
				},
			)
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
		<TreeStyledLi {...props}>
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

			{isRenaming
				? (
						<input
							className="w-full shadow-none ring-0 outline-1"
							autoComplete="off"
							type="text"
							name="name"
							defaultValue={solution.name}
							onBlur={e => handleProblemRename(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleProblemRename(e.currentTarget.value)
								}
							}}
							onFocus={e => e.target.select()}
							ref={inputRenameRef}
						/>
					)
				: (
						<ContextMenu>
							<ContextMenuTrigger asChild>
								<button
									type="button"
									onClick={handleOpenSolution}
									className="size-full text-left"
								>
									{solution.name}
								</button>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem>Open</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem onClick={() => setIsEditingOptions(true)}>Options</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem onClick={handleStartRename}>
									Rename
								</ContextMenuItem>
								<AlertDialog>
									<ContextMenuItem asChild>
										<AlertDialogTrigger className="w-full">
											Delete
										</AlertDialogTrigger>
									</ContextMenuItem>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Delete Solution</AlertDialogTitle>
											<AlertDialogDescription>
												Are you sure you want to delete this solution?
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction onClick={handleSolutionDelete}>
												Delete
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</ContextMenuContent>
						</ContextMenu>
					)}
		</TreeStyledLi>
	)
}
