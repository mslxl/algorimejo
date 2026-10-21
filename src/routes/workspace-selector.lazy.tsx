import { createLazyFileRoute, useNavigate } from "@tanstack/react-router"
import * as dialog from "@tauri-apps/plugin-dialog"

import {
	ArrowLeftIcon,
	ClockIcon,
	FolderIcon,
	FolderOpenIcon,
	PlusIcon,
	XIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
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
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { getFolderName, useWorkspaceSwitcher } from "@/hooks/use-workspace-switcher"

export const Route = createLazyFileRoute("/workspace-selector")({
	component: RouteComponent,
})

function RouteComponent() {
	const navigate = useNavigate()
	const {
		programConfig,
		switchTo: handleWorkspaceSelect,
		reset: handleResetWorkspace,
		removeFromHistory: handleRemoveFromHistory,
	} = useWorkspaceSwitcher()
	const [selectedPath, setSelectedPath] = useState<string>("")

	const handleOpenFolder = async () => {
		try {
			const result = await dialog.open({
				directory: true,
			})
			if (result) {
				setSelectedPath(result)
				await handleWorkspaceSelect(result)
			}
		}
		catch {
			toast.error("Failed to open folder selector")
		}
	}

	if (programConfig.status === "pending") {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		)
	}

	if (programConfig.status === "error") {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<p className="text-destructive">
						Fail to load config:
						{programConfig.error?.message}
					</p>
					<Button onClick={() => navigate({ to: "/" })} className="mt-4">
						Back to home
					</Button>
				</div>
			</div>
		)
	}

	return (
		<ScrollArea className="h-screen">
			<div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
				<div className="container mx-auto max-w-4xl p-6">
					{/* Header */}
					<div className="mb-8">
						<Button
							variant="ghost"
							onClick={() => navigate({ to: "/" })}
							className="mb-4"
						>
							<ArrowLeftIcon className="mr-2 h-4 w-4" />
							Back
						</Button>
						<h1 className="mb-2 text-3xl font-bold text-foreground">
							Select workspace
						</h1>
						<p className="text-muted-foreground">
							Select a folder as your programming workspace, or select from history
						</p>
					</div>

					<div className="grid gap-6 lg:grid-cols-2">
						{/* 打开新文件夹 */}
						<Card className="h-fit">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<PlusIcon className="h-5 w-5" />
									Open new folder
								</CardTitle>
								<CardDescription>
									Select a local folder as new workspace
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<label className="text-sm font-medium">Folder path</label>
									<Input
										placeholder="Click the button below to select a folder..."
										value={selectedPath}
										readOnly
									/>
								</div>
								<Button
									onClick={handleOpenFolder}
									className="w-full"
									size="lg"
								>
									<FolderOpenIcon className="mr-2 h-4 w-4" />
									Select folder
								</Button>
							</CardContent>
						</Card>

						{/* 当前工作空间 */}
						<Card className="h-fit">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<FolderIcon className="h-5 w-5" />
									Current workspace
								</CardTitle>
								<CardDescription>
									Show current workspace
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								{programConfig.data?.workspace
									? (
											<div className="space-y-2">
												<div className="text-sm font-medium">
													{getFolderName(programConfig.data.workspace)}
												</div>
												<div className="font-mono text-xs text-muted-foreground">
													{programConfig.data.workspace}
												</div>
											</div>
										)
									: (
											<div className="text-sm text-muted-foreground">
												No workspace set
											</div>
										)}
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button variant="outline">Reset workspace</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Reset workspace?</AlertDialogTitle>
											<AlertDialogDescription>
												Algorimejo will forget the current workspace and restart. Files in the folder are not deleted.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction onClick={handleResetWorkspace}>Reset and restart</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</CardContent>
						</Card>
					</div>

					{/* 历史记录 */}
					<Card className="mt-6">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<ClockIcon className="h-5 w-5" />
								Recently used workspaces
							</CardTitle>
							<CardDescription>
								Select a recently used workspace
							</CardDescription>
						</CardHeader>
						<CardContent>
							{programConfig.data?.workspace_history && programConfig.data.workspace_history.length > 0
								? (
										<ScrollArea className="h-64">
											<div className="space-y-2">
												{programConfig.data.workspace_history.map((path, index) => (
													<div key={path} className="group">
														<div className="flex items-center justify-between rounded-lg border transition-colors focus-within:bg-accent/50 hover:bg-accent/50">
															<button
																type="button"
																className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
																title={`Open ${path}`}
																onClick={() => handleWorkspaceSelect(path)}
															>
																<FolderIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
																<div className="min-w-0 flex-1">
																	<div className="truncate text-sm font-medium">
																		{getFolderName(path)}
																		{path === programConfig.data.workspace && (
																			<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs font-normal text-muted-foreground">current</span>
																		)}
																	</div>
																	<div className="truncate font-mono text-xs text-muted-foreground">
																		{path}
																	</div>
																</div>
															</button>
															<Button
																variant="ghost"
																size="sm"
																aria-label={`Remove ${getFolderName(path)} from history`}
																title="Remove from history"
																onClick={() => handleRemoveFromHistory(path)}
																className="mr-2 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
															>
																<XIcon className="h-4 w-4" />
															</Button>
														</div>
														{index < programConfig.data.workspace_history.length - 1 && (
															<Separator className="mt-2" />
														)}
													</div>
												))}
											</div>
										</ScrollArea>
									)
								: (
										<div className="py-8 text-center text-muted-foreground">
											<FolderIcon className="mx-auto mb-4 h-12 w-12 opacity-50" />
											<p>No history</p>
											<p className="text-sm">After opening a folder, it will appear here</p>
										</div>
									)}
						</CardContent>
					</Card>

					<div className="mt-8 text-center text-sm text-muted-foreground">
						<p>
							Workspace is where you store your programming projects and configurations.
							Each workspace has its own database and settings.
						</p>
					</div>
				</div>
			</div>
		</ScrollArea>
	)
}
