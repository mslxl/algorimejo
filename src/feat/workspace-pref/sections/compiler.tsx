import type { LanguageBase, LanguageServerProtocolConnectionType } from "@/lib/client"
import { cloneDeep } from "lodash/fp"
import { LucideCircleQuestionMark, LucideCopy, LucidePlusSquare, LucideSave, LucideSettings, LucideTextCursorInput, LucideTrash } from "lucide-react"
import { useState } from "react"
import { v4 as uuid } from "uuid"
import { PrefsItem, PrefsSection } from "@/components/prefs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LanguageBaseValues, LanguageServerProtocolConnectionTypeValues } from "@/lib/client/type"
import { useWorkspacePrefsChangeset, useWorkspacePrefsChangesetApply, useWorkspacePrefsChangesetSetter } from "../prefs-changeset-context"

export function CompilerSection() {
	const changeset = useWorkspacePrefsChangeset()!
	const languageNames = Object.keys(changeset.language!)
	const setChangeset = useWorkspacePrefsChangesetSetter()!
	const applyChangeset = useWorkspacePrefsChangesetApply()!

	const [selectedLanguageName, setSelectedLanguageName] = useState(Object.keys(changeset.language!)[0])
	function handleAddLanguage() {
		setChangeset((draft) => {
			draft.language![`Nova Lingvo ${uuid().substring(0, 4)}`] = {
				base: "Cpp",
				cmd_compile: "",
				cmd_run: "",
				cmd_after_run: null,
				cmd_before_run: null,
				lsp: null,
				lsp_connect: null,
			}
		})
	}
	const allowDeleteLanguage = languageNames.length > 1
	function handleRemoveLanguage(name: string) {
		if (allowDeleteLanguage) {
			setChangeset((draft) => {
				delete draft.language![name]
				setSelectedLanguageName(Object.keys(draft.language!)[0])
			})
		}
	}

	function handleCopyLanguage(name: string) {
		setChangeset((draft) => {
			const newName = `${name} Copy ${uuid().substring(0, 4)}`
			draft.language![newName] = cloneDeep(draft.language![name])
			setSelectedLanguageName(newName)
		})
	}
	const [newLanguageName, setNewLanguageName] = useState("")
	function handleRenameLanguage() {
		setChangeset((draft) => {
			draft.language![newLanguageName] = draft.language![selectedLanguageName]
			delete draft.language![selectedLanguageName]
		})
		setSelectedLanguageName(newLanguageName)
	}
	if (!changeset.language![selectedLanguageName]) {
		return (
			<PrefsSection section="Language">
				<PrefsItem name="Language Configuration" description="Configure compiler settings for different programming languages" className="flex gap-6" hoverHighlight={false}>
					<Skeleton className="h-160 w-80" />
					<Skeleton className="h-160 flex-1" />
				</PrefsItem>
			</PrefsSection>
		)
	}
	return (
		<PrefsSection section="Language">
			<PrefsItem name="Language Configuration" description="Configure compiler settings for different programming languages" className="flex gap-6" hoverHighlight={false}>
				<div className="flex size-full gap-6">
					{/* Language List Panel */}
					<Card className="flex w-80 flex-col">
						<CardHeader className="pb-3">
							<CardTitle className="text-lg">Languages</CardTitle>
							<CardDescription>Select a language to configure</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-1 flex-col p-0">
							<div className="flex items-center gap-2 px-6 pb-4">
								<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={handleAddLanguage}>
									<LucidePlusSquare className="h-4 w-4" />
								</Button>
								<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => handleCopyLanguage(selectedLanguageName)}>
									<LucideCopy className="h-4 w-4" />
								</Button>

								<Dialog>
									<DialogTrigger asChild>
										<Button variant="outline" size="sm" className="h-8 w-8 p-0">
											<LucideTextCursorInput className="size-4" />
										</Button>
									</DialogTrigger>
									<DialogContent className="sm:max-w-[425px]">
										<DialogHeader>
											<DialogTitle>Rename Language</DialogTitle>
											<DialogDescription>
												Enter a new name for the language.
											</DialogDescription>
										</DialogHeader>
										<div className="grid gap-3">
											<Label htmlFor="nu-name">Name</Label>
											<Input autoComplete="off" id="nu-name" defaultValue={selectedLanguageName} onInput={e => setNewLanguageName(e.currentTarget.value)} />
										</div>
										<DialogFooter>
											<DialogClose asChild>
												<Button variant="outline">Cancel</Button>
											</DialogClose>
											<DialogClose asChild>
												<Button onClick={handleRenameLanguage}>Save changes</Button>
											</DialogClose>
										</DialogFooter>
									</DialogContent>
								</Dialog>
								<Button disabled={!allowDeleteLanguage} variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => handleRemoveLanguage(selectedLanguageName)}>
									<LucideTrash className="h-4 w-4" />
								</Button>
							</div>
							<Separator />
							<ScrollArea className="flex-1 p-4">
								<div className="space-y-1">
									{languageNames.map(item => (
										<button
											key={item}
											type="button"
											className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-all duration-200 ${
												selectedLanguageName === item
													? "bg-muted/80"
													: "hover:bg-muted/50"
											}`}
											onClick={() => setSelectedLanguageName(item)}
										>
											{item}
										</button>
									))}
								</div>
							</ScrollArea>
						</CardContent>
					</Card>

					{/* Configuration Panel */}
					<Card className="flex-1">
						<CardHeader>
							<div className="flex items-center gap-2">
								<LucideSettings className="h-5 w-5" />
								<CardTitle className="text-xl">{selectedLanguageName}</CardTitle>
							</div>
							<CardDescription>Configure compiler and language server settings</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{/* Language Syntax Base */}
							<div className="space-y-2">
								<Label htmlFor="language-base" className="text-sm font-medium">Language Syntax Base</Label>
								<Select
									value={changeset.language![selectedLanguageName]!.base}
									onValueChange={(value) => {
										setChangeset((draft) => {
											draft.language![selectedLanguageName]!.base = value as LanguageBase
										})
									}}
								>
									<SelectTrigger id="language-base">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{LanguageBaseValues.map(value => (
											<SelectItem value={value} key={value}>
												{value}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<Separator />

							{/* Compilation Commands */}
							<div className="space-y-4">
								<h4 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Compilation</h4>
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="compile-cmd" className="text-sm font-medium">
											Compile Command
											<CommandInputTooltip />
										</Label>
										<Input
											id="compile-cmd"
											placeholder="e.g., gcc -o %output %input"
											value={changeset.language![selectedLanguageName]!.cmd_compile}
											onInput={e => setChangeset((draft) => {
												draft.language![selectedLanguageName]!.cmd_compile = e.currentTarget.value
											})}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="run-cmd" className="text-sm font-medium">Run Command</Label>
										<Input
											id="run-cmd"
											placeholder="e.g., ./%output"
											value={changeset.language![selectedLanguageName]!.cmd_run ?? ""}
											onInput={e => setChangeset((draft) => {
												draft.language![selectedLanguageName]!.cmd_run = e.currentTarget.value
											})}
										/>
									</div>
								</div>
							</div>

							<Separator />

							{/* Execution Hooks */}
							<div className="space-y-4">
								<h4 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Execution Hooks</h4>
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="before-run" className="text-sm font-medium">
											Before Run Command
											<CommandInputTooltip />
										</Label>
										<Input
											id="before-run"
											placeholder="Optional command to run before execution"
											value={changeset.language![selectedLanguageName]!.cmd_before_run ?? ""}
											onInput={e => setChangeset((draft) => {
												const value = e.currentTarget.value
												if (value.trim().length === 0) {
													draft.language![selectedLanguageName]!.cmd_before_run = null
												}
												else {
													draft.language![selectedLanguageName]!.cmd_before_run = value
												}
											})}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="after-run" className="text-sm font-medium">
											After Run Command
											<CommandInputTooltip />
										</Label>
										<Input
											id="after-run"
											placeholder="Optional command to run after execution"
											value={changeset.language![selectedLanguageName]!.cmd_after_run ?? ""}
											onInput={e => setChangeset((draft) => {
												const value = e.currentTarget.value
												if (value.trim().length === 0) {
													draft.language![selectedLanguageName]!.cmd_after_run = null
												}
												else {
													draft.language![selectedLanguageName]!.cmd_after_run = value
												}
											})}
										/>
									</div>
								</div>
							</div>

							<Separator />

							{/* Language Server */}
							<div className="space-y-4">
								<h4 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Language Server</h4>
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="lsp-cmd" className="text-sm font-medium">
											Language Server Launch Command
											<LanguageServerTooltip />
										</Label>
										<Input
											id="lsp-cmd"
											placeholder="e.g., clangd"
											value={changeset.language![selectedLanguageName]!.lsp ?? ""}
											onInput={e => setChangeset((draft) => {
												const value = e.currentTarget.value
												if (value.trim().length === 0) {
													draft.language![selectedLanguageName]!.lsp = null
												}
												else {
													draft.language![selectedLanguageName]!.lsp = value
												}
											})}
										/>
									</div>
									<div className="space-y-3">
										<Label className="text-sm font-medium">Connection Type</Label>
										<RadioGroup
											value={changeset.language![selectedLanguageName]!.lsp_connect ?? "Disabled"}
											onValueChange={(value) => {
												setChangeset((draft) => {
													if (value === "Disabled") {
														draft.language![selectedLanguageName]!.lsp_connect = null
													}
													else {
														draft.language![selectedLanguageName]!.lsp_connect = value as LanguageServerProtocolConnectionType
													}
												})
											}}
											className="space-y-2"
										>
											<div className="flex items-center space-x-2">
												<RadioGroupItem value="Disabled" id="lsp-disabled" />
												<Label htmlFor="lsp-disabled" className="text-sm">Disabled</Label>
											</div>
											{LanguageServerProtocolConnectionTypeValues.map(value => (
												<div className="flex items-center space-x-2" key={value}>
													<RadioGroupItem value={value} id={value} />
													<Label htmlFor={value} className="text-sm">{value}</Label>
												</div>
											))}
										</RadioGroup>
									</div>
								</div>
							</div>

							<Separator />

							{/* Save Button */}
							<div className="flex justify-end">
								<Button onClick={applyChangeset} className="gap-2">
									<LucideSave className="h-4 w-4" />
									Save Changes
								</Button>
							</div>
						</CardContent>
					</Card>

				</div>
			</PrefsItem>
		</PrefsSection>
	)
}

export function CommandInputTooltip() {
	return (
		<Tooltip>
			<TooltipTrigger><LucideCircleQuestionMark className="size-4 text-muted-foreground" /></TooltipTrigger>
			<TooltipContent>
				<p>You can use the following placeholders in your command:</p>
				<ul>
					<li>%src: The source file</li>
					<li>%target: The target file</li>
					<li>%args: The arguments passed to the command</li>
					<li>%dir: Working directory</li>
					<li>%uuid: A random UUID</li>
				</ul>
			</TooltipContent>
		</Tooltip>
	)
}

export function LanguageServerTooltip() {
	return (
		<Tooltip>
			<TooltipTrigger><LucideCircleQuestionMark className="size-4 text-muted-foreground" /></TooltipTrigger>
			<TooltipContent>
				<p>You can use the following placeholders in your command:</p>
				<ul>
					<li>%src: The source file</li>
					<li>%dir: Working directory</li>
					<li>%port: Websocket port(if enabled)</li>
				</ul>
			</TooltipContent>
		</Tooltip>
	)
}
