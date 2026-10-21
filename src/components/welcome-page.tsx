import type { Shortcut } from "@/lib/shortcuts"
import { useNavigate } from "@tanstack/react-router"
import {
	FolderIcon,
	FolderOpenIcon,
	PlusIcon,
	SettingsIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCreateAndOpenProblem } from "@/hooks/use-problem-creator"
import { getFolderName, useWorkspaceSwitcher } from "@/hooks/use-workspace-switcher"
import { algorimejo } from "@/lib/algorimejo"
import { shortcuts } from "@/lib/shortcuts"
import { ScrollArea } from "./ui/scroll-area"

const shortcutHints: { title: string, shortcut: Shortcut }[] = [
	{ title: "New problem", shortcut: shortcuts.newProblem },
	{ title: "Run all testcases", shortcut: shortcuts.runAllTestcases },
	{ title: "Toggle problem list", shortcut: shortcuts.toggleFileBrowser },
	{ title: "Toggle testcases", shortcut: shortcuts.toggleTestcase },
	{ title: "Toggle terminal", shortcut: shortcuts.toggleTerminal },
	{ title: "Close tab", shortcut: shortcuts.closeTab },
	{ title: "Next tab", shortcut: shortcuts.nextTab },
]

export function WelcomePage() {
	const navigate = useNavigate()
	const { create: createProblem, isPending: isCreatingProblem } = useCreateAndOpenProblem()
	const { currentWorkspace, history, switchTo } = useWorkspaceSwitcher()
	const recentWorkspaces = history.filter(path => path !== currentWorkspace).slice(0, 5)

	const startItems = [
		{
			icon: PlusIcon,
			title: "New Problem",
			description: "Create a problem and start writing a solution",
			shortcut: shortcuts.newProblem.label,
			disabled: isCreatingProblem,
			action: createProblem,
		},
		{
			icon: FolderOpenIcon,
			title: "Open Workspace...",
			description: "Switch to another workspace folder",
			action: () => navigate({ to: "/workspace-selector" }),
		},
		{
			icon: SettingsIcon,
			title: "Workspace Settings",
			description: "Configure compilers, checkers and the editor",
			action: () => algorimejo.openWorkspacePrefTab(),
		},
	]

	return (
		<ScrollArea className="@container select-none">
			<div className="mx-auto grid max-w-4xl gap-x-12 gap-y-8 p-8 @2xl:grid-cols-[minmax(0,1fr)_auto]">
				<div className="min-w-0">
					<header className="mb-8">
						<h1 className="text-3xl font-bold text-foreground">Algorimejo</h1>
						{currentWorkspace && (
							<p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={currentWorkspace}>
								{currentWorkspace}
							</p>
						)}
					</header>

					<section className="mb-8">
						<h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
							Start
						</h2>
						<div className="space-y-1">
							{startItems.map(item => (
								<Button
									key={item.title}
									variant="ghost"
									className="h-auto w-full justify-start gap-3 p-3 text-left"
									disabled={item.disabled}
									onClick={() => item.action()}
								>
									<item.icon className="size-5 text-primary" />
									<div className="min-w-0 flex-1">
										<div className="font-medium">{item.title}</div>
										<div className="text-sm font-normal whitespace-normal text-muted-foreground">
											{item.description}
										</div>
									</div>
									{item.shortcut && (
										<kbd className="rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
											{item.shortcut}
										</kbd>
									)}
								</Button>
							))}
						</div>
					</section>

					<section>
						<h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
							Recent Workspaces
						</h2>
						{recentWorkspaces.length === 0
							? (
									<p className="px-3 text-sm text-muted-foreground">
										Workspaces you open will appear here.
									</p>
								)
							: (
									<div className="space-y-1">
										{recentWorkspaces.map(path => (
											<Button
												key={path}
												variant="ghost"
												className="h-auto w-full justify-start gap-3 px-3 py-2 text-left"
												title={`Open ${path}`}
												onClick={() => switchTo(path)}
											>
												<FolderIcon className="size-4 text-muted-foreground" />
												<span className="font-medium">{getFolderName(path)}</span>
												<span className="min-w-0 flex-1 truncate font-mono text-xs font-normal text-muted-foreground">
													{path}
												</span>
											</Button>
										))}
									</div>
								)}
					</section>
				</div>

				<section>
					<h2 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
						Keyboard Shortcuts
					</h2>
					<dl className="space-y-2 text-sm">
						{shortcutHints.map(hint => (
							<div key={hint.title} className="flex items-center justify-between gap-6">
								<dt className="text-foreground">{hint.title}</dt>
								<dd>
									<kbd className="rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
										{hint.shortcut.label}
									</kbd>
								</dd>
							</div>
						))}
					</dl>
				</section>
			</div>
		</ScrollArea>
	)
}
