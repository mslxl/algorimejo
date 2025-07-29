import { type HTMLAttributes, useRef, useState } from "react";
import { toast } from "react-toastify";
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
} from "@/components/ui/alert-dialog";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useSolutionChangeset } from "@/hooks/use-solution-changeset";
import { useSolutionDeleter } from "@/hooks/use-solution-deleter";
import type { Solution } from "@/lib/client";
import { TreeStyledLi } from "./tree-styled-item";

interface ProblemListItemProps extends HTMLAttributes<HTMLLIElement> {
	solution: Solution;
}
export function ProblemListItem({ solution, ...props }: ProblemListItemProps) {
	const [isRenaming, setIsRenaming] = useState(false);
	const solutionChangesetMutation = useSolutionChangeset();
	const solutionDeleterMutation = useSolutionDeleter();
	const inputRenameRef = useRef<HTMLInputElement>(null);

	function handleStartRename() {
		setIsRenaming(true);
		setTimeout(() => {
			inputRenameRef.current?.focus();
		}, 100);
	}
	function handleProblemRename(newName: string) {
		setIsRenaming(false);
		solutionChangesetMutation.mutate(
			{
				id: solution.id,
				changeset: {
					name: newName,
					author: null,
					language: null,
				},
			},
			{
				onError: (error) => {
					toast.error(`Fail to rename: ${error}`);
				},
			},
		);
	}
	function handleSolutionDelete() {
		solutionDeleterMutation.mutate(solution.id, {
			onError: (error) => {
				toast.error(`Fail to delete: ${error}`);
			},
		});
	}
	return (
		<TreeStyledLi {...props}>
			{isRenaming ? (
				<input
					className="w-full shadow-none ring-0"
					autoComplete="off"
					type="text"
					name="name"
					defaultValue={solution.name}
					onBlur={(e) => handleProblemRename(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							handleProblemRename(e.currentTarget.value);
						}
					}}
					onFocus={(e) => e.target.select()}
					ref={inputRenameRef}
				/>
			) : (
				<ContextMenu>
					<ContextMenuTrigger>{solution.name}</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem>Open</ContextMenuItem>
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
	);
}
