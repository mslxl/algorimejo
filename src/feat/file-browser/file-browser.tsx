import { useQueryClient } from "@tanstack/react-query";
import {
	LucideFilePlus2,
	LucideRefreshCcw,
	LucideSortAsc,
	LucideSortDesc,
} from "lucide-react";
import { type CSSProperties, useState } from "react";
import { toast } from "react-toastify";
import { match } from "ts-pattern";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProblemCreator } from "@/hooks/use-problem-creator";
import {
	PROBLEMS_LIST_QUERY_KEY,
	useProblemsInfiniteQuery,
} from "@/hooks/use-problems-list";
import type { GetProblemsSortBy, SortOrder } from "@/lib/client";
import { ProblemList } from "./problem-list";
import { ProblemListSkeleton } from "./problem-list-skeleton";

const buttonStyle: CSSProperties = {
	width: "16px",
	height: "16px",
};

export function FileBrowser() {
	const [sortOrder, setSortOrder] = useState<SortOrder>("Asc");
	const [searchText, setSearchText] = useState("");
	const [sortBy, setSortBy] = useState<GetProblemsSortBy>("CreateDatetime");
	const queryClient = useQueryClient();
	const problemCreateMutation = useProblemCreator();
	const problemsQueryResult = useProblemsInfiniteQuery(
		searchText,
		sortBy,
		sortOrder,
	);
	function handleProblemCreate() {
		problemCreateMutation.mutate(
			{
				name: "Unamed Problem",
				url: null,
				description: null,
				statement: null,
				checker: null,
				initial_solution: {
					name: "Solution 1",
					language: "cpp",
					author: null,
					content: null,
				},
			},
			{
				onError: (error) => {
					// Tauri errors are strings, not objects with message property
					const errorMessage =
						typeof error === "string"
							? error
							: error?.message || "An error occurred";
					toast.error(`[Database Error]: ${errorMessage}`);
				},
			},
		);
	}
	function handleRefreshExplorer() {
		queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] });
	}

	return (
		<div className="flex flex-col min-h-0">
			<div className="flex justify-end gap-0.5 border-b">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="hover:bg-secondary rounded-md p-1"
							onClick={handleProblemCreate}
						>
							<LucideFilePlus2 style={buttonStyle} />
						</button>
					</TooltipTrigger>
					<TooltipContent>New Problem...</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="hover:bg-secondary rounded-md p-1"
							onClick={handleRefreshExplorer}
						>
							<LucideRefreshCcw style={buttonStyle} />
						</button>
					</TooltipTrigger>
					<TooltipContent>Refresh Explorer</TooltipContent>
				</Tooltip>

				<Popover>
					<PopoverTrigger asChild>
						<button type="button" className="hover:bg-secondary rounded-md p-1">
							{match(sortOrder)
								.with("Asc", () => <LucideSortAsc style={buttonStyle} />)
								.with("Desc", () => <LucideSortDesc style={buttonStyle} />)
								.exhaustive()}
						</button>
					</PopoverTrigger>
					<PopoverContent>
						<div className="space-y-4 p-1">
							<div className="space-y-1.5">
								<div className="text-sm font-medium">Search</div>
								<Input
									value={searchText}
									onChange={(e) => setSearchText(e.target.value)}
									placeholder="Search problems..."
									className="w-full"
								/>
							</div>

							<div className="space-y-1.5">
								<div className="text-sm font-medium">Sort By</div>
								<ToggleGroup
									variant="outline"
									type="single"
									className="justify-start w-full"
									value={sortBy}
									onValueChange={(value) => {
										setSortBy(
											value as "Name" | "CreateDatetime" | "ModifiedDatetime",
										);
									}}
								>
									<ToggleGroupItem value="CreateDatetime">
										Created
									</ToggleGroupItem>
									<ToggleGroupItem value="ModifiedDatetime">
										Modified
									</ToggleGroupItem>
									<ToggleGroupItem value="Name">Name</ToggleGroupItem>
								</ToggleGroup>
							</div>

							<div className="space-y-1.5">
								<div className="text-sm font-medium">Order</div>
								<ToggleGroup
									variant="outline"
									type="single"
									className="justify-start w-full"
									value={sortOrder}
									onValueChange={(value) => {
										setSortOrder(value as "Asc" | "Desc");
									}}
								>
									<ToggleGroupItem value="Asc">Ascending</ToggleGroupItem>
									<ToggleGroupItem value="Desc">Descending</ToggleGroupItem>
								</ToggleGroup>
							</div>
						</div>
					</PopoverContent>
				</Popover>
			</div>
			<div className="flex-1 min-h-0">
				{match(problemsQueryResult)
					.with({ status: "pending" }, () => (
						<ProblemListSkeleton className="size-full" />
					))
					.with({ status: "success" }, (result) => (
						<ProblemList
							className="px-2 h-full overflow-y-auto"
							problems={result.data.pages.flatMap((page) => page.problems)}
							hasNextPage={result.hasNextPage}
							fetchNextPage={result.fetchNextPage}
							isFetchingNextPage={result.isFetchingNextPage}
						/>
					))
					.with({ status: "error" }, (result) => (
						<span>{result.error.message}</span>
					))
					.exhaustive()}
			</div>
		</div>
	);
}
