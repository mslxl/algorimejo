import * as log from "@tauri-apps/plugin-log"
import {
	BookOpenIcon,
	FolderIcon,
	LightbulbIcon,
	PlusIcon,
	SparklesIcon,
	UsersIcon,
} from "lucide-react"
import { toast } from "react-toastify"
import { Button } from "@/components/ui/button"
import { useAppDispatch } from "@/hooks/use-app-dispatch"
import * as sidebarReducers from "@/stores/sidebar-slice"
import { ScrollArea } from "./ui/scroll-area"

export function WelcomePage() {
	const dispatch = useAppDispatch()
	const startItems = [
		{
			icon: PlusIcon,
			title: "New Problem...",
			description: "Create a new coding problem",
			action: () => {
				dispatch(sidebarReducers.select({ key: "file-browser" }))
				toast.info(
					"Open the file browser on the left to start your coding journey!",
					{
						icon: <PlusIcon className="h-4 w-4" />,
					},
				)
			},
		},
		{
			icon: FolderIcon,
			title: "Open Folder...",
			description: "Open a workspace folder",
			action: () => log.trace("Open Folder"),
		},
		{
			icon: UsersIcon,
			title: "Connect to your friends...",
			description: "Connect to your friends",
			action: () => log.trace("Connect to your friends"),
		},
		{
			icon: SparklesIcon,
			title: "Algorimejo Website",
			description: "Visit the Algorimejo website",
			action: () => log.trace("Visit the Algorimejo website"),
		},
	]
	const workthroughsItems = [
		{
			icon: LightbulbIcon,
			title: "Learn the Fundamentals",
			updated: false,
			action: () => log.trace("Learn the Fundamentals"),
		},
		{
			icon: BookOpenIcon,
			title: "Get Started with Connection",
			updated: true,
			action: () => log.trace("Get Started with Connection"),
		},
	]
	return (
		<ScrollArea className="select-none">
			<div className="flex h-full bg-background">
				{/* Left Section */}
				<div className="flex-1 border-r border-border p-8">
					{/* Header */}
					<div className="mb-8">
						<h1 className="mb-2 text-3xl font-bold text-foreground">
							Algorimejo
						</h1>
					</div>

					{/* Start Section */}
					<div className="mb-8">
						<h2 className="mb-4 text-lg font-semibold text-foreground">
							Start
						</h2>
						<div className="space-y-2">
							{startItems.map(item => (
								<Button
									key={item.title}
									variant="ghost"
									className="h-auto w-full justify-start p-3 text-left"
									onClick={() => item.action?.()}
								>
									<item.icon className="mr-3 h-5 w-5 text-muted-foreground" />
									<div>
										<div className="font-medium">{item.title}</div>
										<div className="text-sm text-muted-foreground">
											{item.description}
										</div>
									</div>
								</Button>
							))}
						</div>
					</div>

					{/* Recent Section */}
					<div>
						<h2 className="mb-4 text-lg font-semibold text-foreground">
							Recent
						</h2>
						<div className="space-y-2">
							{/* TODO */}
							{/* <Button
								variant="ghost"
								className="w-full justify-start h-auto p-3 text-left"
								onClick={() => console.log("Recent: koakuma")}
							>
								<FolderIcon className="mr-3 h-5 w-5 text-muted-foreground" />
								<div className="text-sm">koakuma D:\</div>
							</Button> */}
						</div>
					</div>
				</div>

				{/* Right Section */}
				<div className="flex-1 p-8">
					<h2 className="mb-6 text-lg font-semibold text-foreground">
						Walkthroughs
					</h2>
					<div className="space-y-4">
						<div className="border-b border-border pb-4">
							<Button
								variant="ghost"
								className="h-auto w-full justify-start p-3 text-left"
								onClick={() => log.trace("Get started with Algorimejo")}
							>
								<SparklesIcon className="mr-3 h-5 w-5 text-yellow-500" />
								<div>
									<div className="font-medium">Get started with Algorimejo</div>
									<div className="text-sm text-muted-foreground">
										Customize your editor, learn the basics, and start coding.
									</div>
								</div>
							</Button>
						</div>

						{workthroughsItems.map(item => (
							<Button
								key={item.title}
								variant="ghost"
								className="h-auto w-full justify-start p-3 text-left"
								onClick={() => log.trace("Get Started with Jupyter")}
							>
								<BookOpenIcon className="mr-3 h-5 w-5 text-muted-foreground" />
								<div className="flex items-center gap-2">
									<div className="font-medium">{item.title}</div>
									{item.updated && (
										<span className="rounded bg-red-500 px-2 py-1 text-xs text-white">
											Updated
										</span>
									)}
								</div>
							</Button>
						))}
						<Button
							variant="ghost"
							className="h-auto w-full justify-start p-3 text-left text-primary"
							onClick={() => log.trace("More walkthroughs")}
						>
							<div className="text-sm">More...</div>
						</Button>
					</div>
				</div>
			</div>
		</ScrollArea>
	)
}
