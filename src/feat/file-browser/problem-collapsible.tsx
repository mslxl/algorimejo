import { LucideFile } from "lucide-react";
import { useRef, useState } from "react";
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
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProblemChangeset } from "@/hooks/use-problem-changeset";
import { useProblemDeleter } from "@/hooks/use-problem-deleter";
import { useSolutionCreator } from "@/hooks/use-solution-creator";
import { algorimejo } from "@/lib/algorimejo";
import { commands, type Problem } from "@/lib/client";
import { selectMonacoDocumentTabIndex } from "../editor/utils";
import { ProblemDetail } from "./problem-detail";
import { ProblemListItem } from "./problem-list-item";

interface ProblemCollapsibleProps {
	problem: Problem;
	onOpenChange: (value: boolean) => void;
	open: boolean;
}

export function ProblemCollapsible({
	problem,
	onOpenChange,
	open,
}: ProblemCollapsibleProps) {
	const [isRenaming, setIsRenaming] = useState(false);
	const problemDeleteMutation = useProblemDeleter();
	const problemChangesetMutation = useProblemChangeset();
	const solutionCreateMutation = useSolutionCreator();

	const inputRenameRef = useRef<HTMLInputElement>(null);
	function handleDeleteProblem() {
		problemDeleteMutation.mutate(problem.id, {
			onError: (error) => {
				toast.error(error.message);
			},
			onSuccess: () => {
				for (const sol of problem.solutions) {
					if (sol.document) {
						const tabIndex = algorimejo.selectStateValue(
							selectMonacoDocumentTabIndex(sol.document.id),
						);
						if (tabIndex !== -1) {
							algorimejo.closeTab(tabIndex);
						}
					}
				}
			},
		});
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
		});
	}
	function handleStartRename() {
		setIsRenaming(true);
		setTimeout(() => {
			inputRenameRef.current?.focus();
		}, 100);
	}
	function handleProblemRename(newName: string) {
		setIsRenaming(false);
		problemChangesetMutation.mutate(
			{
				id: problem.id,
				changeset: {
					name: newName,
					url: null,
					description: null,
					statement: null,
					checker: null,
				},
			},
			{
				onError: (error) => {
					toast.error(`Fail to rename: ${error}`);
				},
				onSuccess: async () => {
					for (const sol of problem.solutions) {
						if (sol.document) {
							const tabIndex = algorimejo.selectStateValue(
								selectMonacoDocumentTabIndex(sol.document.id),
							);
							if (tabIndex !== -1) {
								algorimejo.renameTab(tabIndex, `${sol.name} - ${newName}`);
							}
						}
					}
				},
			},
		);
	}

	return (
		<Collapsible
			className="select-none"
			onOpenChange={onOpenChange}
			open={open}
		>
			<ContextMenu>
				{isRenaming ? (
					<div className="flex w-full items-center gap-1 text-sm">
						<span>
							<LucideFile className="size-4" />
						</span>
						<input
							className="w-full shadow-none outline-1 ring-0"
							autoComplete="off"
							type="text"
							name="name"
							defaultValue={problem.name}
							onBlur={(e) => handleProblemRename(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleProblemRename(e.currentTarget.value);
								}
							}}
							onFocus={(e) => e.target.select()}
							ref={inputRenameRef}
						/>
					</div>
				) : (
					<Tooltip delayDuration={1000}>
						<ContextMenuTrigger asChild>
							<CollapsibleTrigger
								className="flex hover:bg-secondary w-full items-center gap-1 text-sm"
								asChild
							>
								<TooltipTrigger>
									<LucideFile className="size-4" />
									{/* <LucideFileCheck/> */}
									{problem.name}
								</TooltipTrigger>
							</CollapsibleTrigger>
						</ContextMenuTrigger>
						<TooltipContent>
							<ProblemDetail problem={problem} />
						</TooltipContent>
					</Tooltip>
				)}
				<ContextMenuContent>
					<ContextMenuItem onClick={handleCreateSolution}>
						New Solution
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={handleStartRename}>Rename</ContextMenuItem>
					<AlertDialog>
						<ContextMenuItem asChild>
							<AlertDialogTrigger className="w-full">Delete</AlertDialogTrigger>
						</ContextMenuItem>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Problem</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete this problem?
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction onClick={handleDeleteProblem}>
									Delete
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</ContextMenuContent>
			</ContextMenu>
			<CollapsibleContent asChild>
				<ul>
					{problem.solutions.map((solution) => (
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
	);
}
