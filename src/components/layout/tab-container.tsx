import type { HTMLAttributes } from "react"
import type { TabInstance } from "@/lib/algorimejo/tab-manager"
import { LucideFileCode2, LucideX } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Suspense } from "react"
import { algorimejo } from "@/lib/algorimejo"
import { useObservable } from "@/lib/observable"
import { cn } from "@/lib/utils"
import { LucideIcon } from "../lucide-icon"
import { TabbarScrollArea } from "../tabbar-scroll-area"
import { Skeleton } from "../ui/skeleton"
import { WelcomePage } from "../welcome-page"

interface TabBarProps extends HTMLAttributes<HTMLDivElement> {}

function TabBar({ className, ...props }: TabBarProps) {
	const tabs = useObservable(algorimejo.tab.tabs)
	const selectedIndex = useObservable(algorimejo.tab.selectedIndex)
	function handleClickTab(idx: number) {
		algorimejo.tab.removeTabByIndex(idx)
	}
	function handleSelectTab(idx: number) {
		algorimejo.tab.selectTabByIndex(idx)
	}
	return (
		<TabbarScrollArea className={cn("bg-secondary/40 select-none", className)}>
			<div className="flex w-max items-stretch justify-stretch" {...props}>
				<AnimatePresence>
					{tabs.map((tab, index) => {
						const isSelected = index === selectedIndex
						return (
							<motion.div
								initial={{
									width: "0",
								}}
								animate={{
									width: "auto",
								}}
								exit={{
									width: "0",
								}}
								key={tab.id}
								data-tab-id={tab.id}
								data-tab-key={tab.key}
								className={cn("h-6 pr-1 tab-item flex items-center group", {
									"bg-secondary/80": isSelected,
								})}
							>
								<button
									type="button"
									className="flex items-center truncate  pl-2"
									onClick={() => handleSelectTab(index)}
								>
									{tab.icon
										? (
												<LucideIcon name={tab.icon} className="size-4" />
											)
										: (
												<LucideFileCode2 className="size-4" />
											)}
									<span className="mr-1 ml-2 text-sm">{tab.title}</span>
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
										handleClickTab(index)
									}}
								>
									<LucideX className="size-3" />
								</button>
							</motion.div>
						)
					})}

				</AnimatePresence>
			</div>
		</TabbarScrollArea>
	)
}

interface TabContentProps {
	tab: TabInstance
}

function TabContent({ tab }: TabContentProps) {
	const UI = algorimejo.getUI(tab.key)
	if (UI) {
		return (
			<Suspense fallback={<Skeleton className="size-full p-8" />}>
				<UI data={tab.data} key={tab.id} />
			</Suspense>
		)
	}
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center select-none">
			<h1 className="text-3xl font-bold text-gray-800">
				Page "
				{tab.key}
				" does not exist!
			</h1>
			<p className="text-muted-foreground">
				The requested page could not be found. Here is the page data:
			</p>
			<code className="max-w-full overflow-auto rounded-lg bg-secondary p-4 text-left font-mono text-sm select-all">
				<pre>{JSON.stringify(tab, null, 2)}</pre>
			</code>
		</div>
	)
}

interface TabContainerProps extends HTMLAttributes<HTMLDivElement> {}
export function TabContainer({ className, ...props }: TabContainerProps) {
	const currentTab = useObservable(algorimejo.tab.selectedTab)

	return (
		<div className={cn(className, "flex flex-col")} {...props}>
			<TabBar />
			<div className="min-h-0 flex-1 [&>*:first-child]:size-full">
				{currentTab ? <TabContent tab={currentTab} /> : <WelcomePage />}
			</div>
		</div>
	)
}
