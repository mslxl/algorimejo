import { debounce } from "lodash/fp";
import {
	LucideBugPlay,
	LucidePlay,
	LucidePlus,
	LucideTrash,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { match, P } from "ts-pattern";
import { ErrorLabel } from "@/components/error-label";
import { MonacoCodeEditor } from "@/components/monaco";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useProblem } from "@/hooks/use-problem";
import { useTestcaseCreator } from "@/hooks/use-testcase-creator";
import { useTestcases } from "@/hooks/use-testcases";
import type { Problem, TestCase } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { OpenedTab } from "@/stores/tab-slice";
import { monacoEditorPageDataSchema } from "../editor/editor";

interface TestcaseContentProps {
	tab: OpenedTab;
}
export function TestcaseContent({ tab }: TestcaseContentProps) {
	const problemTabData = monacoEditorPageDataSchema.parse(tab.data);
	const problemQuery = useProblem(problemTabData.problemID);
	const testcasesQuery = useTestcases(problemTabData.problemID);

	return (
		<div className="flex flex-col min-h-0 select-none" key={tab.id}>
			<div className="border-b h-6 px-2 text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">
				Test: {tab.title}
			</div>

			<div className="flex-1 min-h-0">
				{match({
					problemQuery,
					testcasesQuery,
				})
					.with(
						P.union(
							{ problemQuery: { status: "pending" } },
							{ testcasesQuery: { status: "pending" } },
						),
						() => <TestcaseSkeleton />,
					)
					.with(
						{
							problemQuery: { status: "success" },
							testcasesQuery: { status: "success" },
						},
						(data) => (
							<TestcaseList
								problem={data.problemQuery.data}
								solutionID={problemTabData.solutionID}
								testcases={data.testcasesQuery.data}
							/>
						),
					)
					.with({ problemQuery: { status: "error" } }, (error) => (
						<ErrorLabel message={error.problemQuery.error.message} />
					))
					.with({ testcasesQuery: { status: "error" } }, (error) => (
						<ErrorLabel message={error.testcasesQuery.error.message} />
					))
					.exhaustive()}
			</div>
		</div>
	);
}

function TestcaseSkeleton() {
	return (
		<>
			<div className="flex gap-2">
				<Skeleton className="h-8 flex-1" />
				<Skeleton className="size-8" />
			</div>
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
			<Skeleton className="h-20" />
		</>
	);
}

interface TestcaseListProps {
	problem: Problem;
	testcases: TestCase[];
	solutionID: string;
}
function TestcaseList({ problem, testcases }: TestcaseListProps) {
	const testcaseCreateMutation = useTestcaseCreator();

	const panelRef = useRef<HTMLDivElement>(null);
	const [colsNum, setColsNum] = useState(1);

	useEffect(() => {
		if (!panelRef.current) return;
		const panel = panelRef.current;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				setColsNum(Math.min(Math.floor(entry.contentRect.width / 200), 3));
			}
		});
		observer.observe(panel);
		return () => observer.disconnect();
	}, []);

	const handleCreateTestcase = debounce(
		400,
		useCallback(() => {
			testcaseCreateMutation.mutate(problem.id, {
				onError: (error) => {
					if (error instanceof Error) {
						toast.error(error.message);
					} else {
						toast.error(error);
					}
				},
			});
		}, [testcaseCreateMutation, problem.id]),
	);

	return (
		<div className="flex flex-col h-full p-2 pr-0" ref={panelRef}>
			<ScrollArea className="flex-1 min-h-0">
				<div className="p-2 mr-2">
					<div className="flex gap-0.5 flex-wrap mb-4 sticky top-0 bg-background border p-2 rounded-md">
						{testcases.map((testcase) => (
							<span
								className="size-4 rounded-sm border transition-colors hover:bg-gray-100"
								key={testcase.id}
								title={`Testcase #${testcase.id}`}
							/>
						))}
					</div>

					<ul className="space-y-4">
						{testcases.map((testcase, index) => (
							<li
								key={testcase.id}
								className="border rounded-lg p-4 shadow-sm hover:shadow transition-shadow"
							>
								<div
									className={cn("grid gap-4", {
										"grid-cols-1": colsNum === 1,
										"grid-cols-2": colsNum === 2,
										"grid-cols-3": colsNum === 3,
									})}
								>
									<div className="space-y-2 flex flex-col">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">
												Input #{index}
											</span>
										</div>
										<div className="rounded-md overflow-hidden border flex-1">
											<MonacoCodeEditor
												className="size-full min-h-32"
												documentID={testcase.input_document_id}
											/>
										</div>
									</div>

									<div className="space-y-2 flex flex-col">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">
												Answer #{index}
											</span>
										</div>
										<div className="rounded-md overflow-hidden border flex-1">
											<MonacoCodeEditor
												className="size-full min-h-32"
												documentID={testcase.answer_document_id}
											/>
										</div>
									</div>

									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium">
												Output #{index}
											</span>
										</div>
										<textarea
											className="w-full rounded-md border p-2 min-h-32 resize-y"
											disabled
											placeholder="Output will appear here..."
										/>
									</div>
									<div className="flex items-center gap-2">
										<Button variant="destructive" size="icon">
											<LucideTrash />
										</Button>
										<Button variant="outline" size="icon">
											<LucidePlay />
										</Button>
										<Button variant="outline" size="icon">
											<LucideBugPlay />
										</Button>
									</div>
								</div>
							</li>
						))}
					</ul>
				</div>
			</ScrollArea>
			<div className="flex justify-end gap-2 p-4 border-t bg-background shrink-0">
				<Button variant="outline" onClick={handleCreateTestcase}>
					<LucidePlus />
				</Button>
				<Button>Run All</Button>
			</div>
		</div>
	);
}
