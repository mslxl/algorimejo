import { LucideFileCode2, LucideX } from "lucide-react";
import type { HTMLAttributes } from "react";
import { useAppDispatch } from "@/hooks/use-app-dispatch";
import { useAppSelector } from "@/hooks/use-app-selector";
import { algorimejo } from "@/lib/algorimejo";
import { cn } from "@/lib/utils";
import { close, type OpenedTab, select } from "@/stores/tab-slice";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { WelcomePage } from "../welcome-page";

interface TabBarProps extends HTMLAttributes<HTMLDivElement> {}

function TabBar({ className, ...props }: TabBarProps) {
	const tabs = useAppSelector((state) => state.tab.tabs);
	const selectedIndex = useAppSelector((state) => state.tab.selected);
	const dispatch = useAppDispatch();
	function handleClickTab(idx: number) {
		dispatch(close(idx));
	}
	function handleSelectTab(idx: number) {
		dispatch(select(idx));
	}
	return (
		<ScrollArea className={cn("bg-secondary select-none", className)}>
			<div className="flex w-max items-stretch justify-stretch" {...props}>
				{tabs.map((tab, index) => {
					const isSelected = index === selectedIndex;
					return (
						<div
							key={tab.id}
							data-tab-id={tab.id}
							data-tab-key={tab.key}
							className={cn("h-6 pr-1 tab-item flex items-center group", {
								"bg-white": isSelected,
							})}
						>
							<button
								type="button"
								className="flex pl-2 items-center"
								onClick={() => handleSelectTab(index)}
							>
								{tab.icon ? (
									<tab.icon className="size-4" />
								) : (
									<LucideFileCode2 className="size-4" />
								)}
								<span className="text-sm ml-2 mr-1">{tab.title}</span>
							</button>
							<button
								type="button"
								className={cn(
									"hover:bg-secondary invisible group-hover:visible border border-background group-hover:border-white p-1 rounded-sm",
									{
										visible: isSelected,
									},
								)}
								onClick={() => {
									handleClickTab(index);
								}}
							>
								<LucideX className="size-3" />
							</button>
						</div>
					);
				})}
			</div>
			<ScrollBar orientation="horizontal" />
		</ScrollArea>
	);
}

interface TabContentProps {
	tab: OpenedTab;
}

function TabContent({ tab }: TabContentProps) {
	const UI = algorimejo.getUI(tab.key);
	if (UI) {
		return <UI data={tab.data} key={tab.id} />;
	}
	return (
		<div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center select-none">
			<h1 className="text-3xl font-bold text-gray-800">
				Page "{tab.key}" does not exist!
			</h1>
			<p className="text-muted-foreground">
				The requested page could not be found. Here is the page data:
			</p>
			<code className="p-4 bg-secondary rounded-lg text-sm font-mono overflow-auto max-w-full text-left select-all">
				<pre>{JSON.stringify(tab, null, 2)}</pre>
			</code>
		</div>
	);
}

interface TabContainerProps extends HTMLAttributes<HTMLDivElement> {}
export function TabContainer({ className, ...props }: TabContainerProps) {
	const currentTab = useAppSelector(
		(state) =>
			(state.tab.tabs[state.tab.selected] as undefined | OpenedTab) ?? null,
	);

	return (
		<div className={cn(className, "flex flex-col")} {...props}>
			<TabBar />
			<div className="flex-1 min-h-0 [&>*:first-child]:size-full">
				{currentTab ? <TabContent tab={currentTab} /> : <WelcomePage />}
			</div>
		</div>
	);
}
