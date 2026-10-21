import type { PanelButtonProps } from "@/lib/algorimejo/algorimejo"
import type { GetProblemsSortBy, SortOrder } from "@/lib/client"
import { useQueryClient } from "@tanstack/react-query"
import {
	LucideFile,
	LucideFilePlus2,
	LucideRefreshCcw,
	LucideSearch,
	LucideSortAsc,
	LucideSortDesc,
} from "lucide-react"
import { useState } from "react"
import { match } from "ts-pattern"
import { ErrorLabel } from "@/components/error-label"
import { SidebarButtonDefault } from "@/components/layout/sidebar-button-default"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { useCreateAndOpenProblem } from "@/hooks/use-problem-creator"
import {
	PROBLEMS_LIST_QUERY_KEY,
	useProblemsInfiniteQuery,
} from "@/hooks/use-problems-list"
import { shortcuts } from "@/lib/shortcuts"
import { ProblemList } from "./problem-list"
import { ProblemListSkeleton } from "./problem-list-skeleton"

export function FileBrowserButton(props: PanelButtonProps) {
	return (
		<SidebarButtonDefault {...props}>
			<LucideFile className="size-4 rotate-90" />
			Problems
		</SidebarButtonDefault>
	)
}

const toolbarButtonClassname = "rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"

export function FileBrowser() {
	const [sortOrder, setSortOrder] = useState<SortOrder>("Asc")
	const [searchText, setSearchText] = useState("")
	const [sortBy, setSortBy] = useState<GetProblemsSortBy>("CreateDatetime")
	const queryClient = useQueryClient()
	const { create: createProblem } = useCreateAndOpenProblem()
	const problemsQueryResult = useProblemsInfiniteQuery(
		searchText,
		sortBy,
		sortOrder,
	)
	function handleRefreshExplorer() {
		queryClient.invalidateQueries({ queryKey: [PROBLEMS_LIST_QUERY_KEY] })
	}

	return (
		<div className="flex min-h-0 flex-col">
			<div className="flex h-7 shrink-0 items-center gap-0.5 border-b px-2">
				<span className="flex-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase select-none">
					Problems
				</span>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="New problem"
							className={toolbarButtonClassname}
							onClick={createProblem}
						>
							<LucideFilePlus2 className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent>
						New Problem
						{" "}
						<span className="opacity-70">{shortcuts.newProblem.label}</span>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Refresh"
							className={toolbarButtonClassname}
							onClick={handleRefreshExplorer}
						>
							<LucideRefreshCcw className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent>Refresh</TooltipContent>
				</Tooltip>

				<Popover>
					<Tooltip>
						<TooltipTrigger asChild>
							<PopoverTrigger asChild>
								<button type="button" aria-label="Sort" className={toolbarButtonClassname}>
									{match(sortOrder)
										.with("Asc", () => <LucideSortAsc className="size-4" />)
										.with("Desc", () => <LucideSortDesc className="size-4" />)
										.exhaustive()}
								</button>
							</PopoverTrigger>
						</TooltipTrigger>
						<TooltipContent>Sort</TooltipContent>
					</Tooltip>
					<PopoverContent>
						<div className="space-y-4 p-1">
							<div className="space-y-1.5">
								<div className="text-sm font-medium">Sort By</div>
								<ToggleGroup
									variant="outline"
									type="single"
									className="w-full justify-start"
									value={sortBy}
									onValueChange={(value) => {
										if (value)
											setSortBy(value as GetProblemsSortBy)
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
									className="w-full justify-start"
									value={sortOrder}
									onValueChange={(value) => {
										if (value)
											setSortOrder(value as SortOrder)
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
			<div className="relative shrink-0 border-b p-1.5">
				<LucideSearch className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={searchText}
					onChange={e => setSearchText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape")
							setSearchText("")
					}}
					placeholder="Search problems"
					aria-label="Search problems"
					className="h-7 pl-7 text-sm"
				/>
			</div>
			<div className="min-h-0 flex-1">
				{match(problemsQueryResult)
					.with({ status: "pending" }, () => (
						<ProblemListSkeleton className="size-full" />
					))
					.with({ status: "success" }, (result) => {
						const problems = result.data.pages.flatMap(page => page.problems)
						if (problems.length === 0) {
							return (
								<div className="flex flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground select-none">
									{searchText
										? (
												<p>
													No problems match "
													{searchText}
													".
												</p>
											)
										: (
												<>
													<p>No problems in this workspace yet.</p>
													<Button size="sm" onClick={createProblem}>
														<LucideFilePlus2 />
														New Problem
													</Button>
												</>
											)}
								</div>
							)
						}
						return (
							<ProblemList
								className="h-full overflow-y-auto px-1 py-1"
								problems={problems}
								hasNextPage={result.hasNextPage}
								fetchNextPage={result.fetchNextPage}
								isFetchingNextPage={result.isFetchingNextPage}
							/>
						)
					})
					.with({ status: "error" }, result => (
						<ErrorLabel message={result.error} location="loading problems" />
					))
					.exhaustive()}
			</div>
		</div>
	)
}
