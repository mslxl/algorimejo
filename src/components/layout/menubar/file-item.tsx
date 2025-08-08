import { toast } from "react-toastify";
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
} from "@/components/ui/alert-dialog";
import {
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarSeparator,
	MenubarSub,
	MenubarSubContent,
	MenubarSubTrigger,
	MenubarTrigger,
} from "@/components/ui/menubar";
import { useDefaultProblemCreator } from "@/hooks/use-problem-creator";
import { algorimejo } from "@/lib/algorimejo";
import { commands } from "@/lib/client";

export function MenubarFileItem() {
	const problemCreateMutation = useDefaultProblemCreator();
	function handleCreateProblem() {
		problemCreateMutation.mutate(undefined, {
			onError: (error) => {
				// Tauri errors are strings, not objects with message property
				const errorMessage =
					typeof error === "string"
						? error
						: error?.message || "An error occurred";
				toast.error(`[Database Error]: ${errorMessage}`);
			},
			onSuccess: (data) => {
				const problem = data.problem;
				if (problem.solutions[0].document) {
					algorimejo.createEditorTab(
						problem.solutions[0].document.id,
						problem.id,
						problem.solutions[0].id,
						{
							title: `${problem.name} - ${problem.solutions[0].name}`,
							language: problem.solutions[0].language,
						},
					);
				} else {
					toast.error(
						`[Database Error]: Solution ${problem.solutions[0].name} has no document included! This should not happen! Please report this issue to the developer.`,
					);
				}
			},
		});
	}
	function handleExit() {
		commands.exitApp();
	}
	return (
		<MenubarMenu>
			<MenubarTrigger>File</MenubarTrigger>
			<MenubarContent>
				<MenubarItem onClick={handleCreateProblem}>New Problem</MenubarItem>
				<MenubarSeparator />
				<MenubarItem>Open Workspace...</MenubarItem>
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
						<MenubarItem>Workspace Settings</MenubarItem>
						<MenubarItem>Algorimejo Settings</MenubarItem>
					</MenubarSubContent>
				</MenubarSub>
				<MenubarSeparator />
				<AlertDialog>
					<MenubarItem asChild>
						<AlertDialogTrigger className="w-full">Exit</AlertDialogTrigger>
					</MenubarItem>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Are you sure?</AlertDialogTitle>
							<AlertDialogDescription>
								Some unsaved changes will be lost forever!(A long time!).
								{/* The emph way from Minecraft. lol*/}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={handleExit}>Exit</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</MenubarContent>
		</MenubarMenu>
	);
}
