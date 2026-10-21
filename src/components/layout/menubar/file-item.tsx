import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarSeparator,
	MenubarShortcut,
	MenubarSub,
	MenubarSubContent,
	MenubarSubTrigger,
	MenubarTrigger,
} from "@/components/ui/menubar"
import { useCreateAndOpenProblem } from "@/hooks/use-problem-creator"
import { algorimejo } from "@/lib/algorimejo"
import { commands } from "@/lib/client"
import { shortcuts } from "@/lib/shortcuts"

export function MenubarFileItem() {
	const { create: createProblem } = useCreateAndOpenProblem()
	const navigate = useNavigate()
	// The dialog lives outside the menu, otherwise it unmounts together with the closing menu
	const [isExitDialogOpen, setIsExitDialogOpen] = useState(false)
	function handleExit() {
		commands.exitApp()
	}
	function handleOpenWorkspacePrefs() {
		algorimejo.openWorkspacePrefTab()
	}
	function handleOpenProgramPrefs() {
		algorimejo.openProgramPrefTab()
	}
	return (
		<>
			<MenubarMenu>
				<MenubarTrigger>File</MenubarTrigger>
				<MenubarContent>
					<MenubarItem onClick={createProblem}>
						New Problem
						<MenubarShortcut>{shortcuts.newProblem.label}</MenubarShortcut>
					</MenubarItem>
					<MenubarSeparator />
					<MenubarItem onClick={() => navigate({ to: "/workspace-selector" })}>Open Workspace...</MenubarItem>
					<MenubarSeparator />
					{/* TODO */}
					{/* <MenubarItem>Open Recent</MenubarItem>
						<MenubarItem>Import External File...</MenubarItem>
						<MenubarSeparator /> */}
					{/* TODO */}
					{/* <MenubarItem>Export to...</MenubarItem> */}
					{/* <MenubarItem>Share<MenubarItem> */}
					<MenubarSub>
						<MenubarSubTrigger>Preferences</MenubarSubTrigger>
						<MenubarSubContent>
							<MenubarItem onClick={handleOpenWorkspacePrefs}>Workspace Settings</MenubarItem>
							<MenubarItem onClick={handleOpenProgramPrefs}>Algorimejo Settings</MenubarItem>
						</MenubarSubContent>
					</MenubarSub>
					<MenubarSeparator />
					<MenubarItem onClick={() => algorimejo.tab.closeSelectedTab()}>
						Close Tab
						<MenubarShortcut>{shortcuts.closeTab.label}</MenubarShortcut>
					</MenubarItem>
					<MenubarItem onClick={() => setIsExitDialogOpen(true)}>Exit</MenubarItem>
				</MenubarContent>
			</MenubarMenu>
			<AlertDialog open={isExitDialogOpen} onOpenChange={setIsExitDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Exit Algorimejo?</AlertDialogTitle>
						<AlertDialogDescription>
							Running programs and terminal sessions will be stopped.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleExit}>Exit</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
