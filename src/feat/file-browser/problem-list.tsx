import {
	useVirtualizer,
	type VirtualItem,
	type Virtualizer,
} from "@tanstack/react-virtual";
import { type HTMLAttributes, useEffect, useReducer, useRef } from "react";
import { match } from "ts-pattern";
import type { Problem } from "@/lib/client";
import { ProblemCollapsible } from "./problem-collapsible";
import { ProblemListSkeletonItem } from "./problem-list-skeleton";

interface ProblemListProps extends HTMLAttributes<HTMLDivElement> {
	problems: Problem[];
	hasNextPage?: boolean;
	fetchNextPage?: () => void;
	isFetchingNextPage?: boolean;
}
export function ProblemList({
	problems,
	hasNextPage = false,
	fetchNextPage,
	isFetchingNextPage = false,
	...props
}: ProblemListProps) {
	const parentRef = useRef<HTMLDivElement>(null);
	const innerRef = useRef<HTMLUListElement>(null);

	const [rowOpenStateMap, dispatchRowOpenState] = useReducer(
		(
			state: Record<number, boolean>,
			action: { type: "set"; index: number; value: boolean },
		) => {
			switch (action.type) {
				case "set":
					return {
						...state,
						[action.index]: action.value,
					};
				default:
					return state;
			}
		},
		{},
	);

	const rowVirtualizer = useVirtualizer({
		count: hasNextPage ? problems.length + 1 : problems.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 20,
		overscan: 1,
	});
	useEffect(() => {
		const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();

		if (!lastItem) return;
		if (
			lastItem.index >= problems.length - 1 &&
			hasNextPage &&
			!isFetchingNextPage
		) {
			fetchNextPage?.();
		}
	}, [
		fetchNextPage,
		problems,
		isFetchingNextPage,
		rowVirtualizer,
		hasNextPage,
	]);
	return (
		<div {...props} ref={parentRef}>
			<ul
				ref={innerRef}
				className="w-full relative"
				style={{
					height: `${rowVirtualizer.getTotalSize()}px`,
				}}
			>
				{rowVirtualizer.getVirtualItems().map((virtualRow) => {
					const isLoaderRow = virtualRow.index > problems.length - 1;
					// problem is undefined when isLoaderRow is true
					const problem: Problem = problems[virtualRow.index];
					return (
						<ProblemListItem
							key={virtualRow.key}
							virtualRow={virtualRow}
							problem={problem}
							virtualizer={rowVirtualizer}
							onOpenChange={(value) =>
								dispatchRowOpenState({
									type: "set",
									index: virtualRow.index,
									value,
								})
							}
							open={rowOpenStateMap[virtualRow.index] ?? false}
							isLoaderRow={isLoaderRow}
							hasNextPage={hasNextPage}
						/>
					);
				})}
			</ul>
		</div>
	);
}

interface ProblemListItem {
	virtualizer: Virtualizer<HTMLDivElement, Element>;
	virtualRow: VirtualItem;
	problem: Problem;
	isLoaderRow: boolean;
	hasNextPage: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}
function ProblemListItem({
	virtualRow,
	problem,
	virtualizer,
	onOpenChange,
	open,
	isLoaderRow,
	hasNextPage,
}: ProblemListItem) {
	const innerRef = useRef<HTMLDivElement | null>(null);
	function handleOpen(value: boolean) {
		onOpenChange(value);
		setTimeout(() => {
			if (innerRef.current) {
				virtualizer.resizeItem(virtualRow.index, innerRef.current.scrollHeight);
			}
		});
	}
	return (
		<li
			key={virtualRow.key}
			data-index={virtualRow.index}
			data-problem={problem?.id}
			className="left-0 top-0 absolute w-full"
			style={{
				height: `${virtualRow.size}px`,
				transform: `translateY(${virtualRow.start}px)`,
			}}
			ref={(el) => {
				virtualizer.measureElement(el);
			}}
		>
			<div className="w-full" ref={innerRef}>
				{match({ isLoaderRow, hasNextPage })
					.with({ isLoaderRow: true, hasNextPage: true }, () => (
						<ProblemListSkeletonItem />
					))
					.with({ isLoaderRow: true, hasNextPage: false }, () => (
						<span>End</span>
					))
					.otherwise(() => (
						<ProblemCollapsible
							problem={problem}
							open={open}
							onOpenChange={handleOpen}
						/>
					))}
			</div>
		</li>
	);
}
