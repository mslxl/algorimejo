import type { Checker, CheckerBuildResult, CheckerScope, CheckerSelfTest, CheckerSelfTestResult, UpsertCheckerSelfTestParams } from "@/lib/client"
import { useMutation } from "@tanstack/react-query"
import { LucideBookOpen, LucideCheck, LucideCode2, LucideHammer, LucidePlay, LucidePlus, LucideSave, LucideSettings2, LucideTrash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "react-toastify"
import { CodeEditor } from "@/components/editor"
import { ErrorLabel } from "@/components/error-label"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { withMainUIData } from "@/components/zod-main-ui-data-checker"
import { useAvailableLanguage } from "@/hooks/use-available-language"
import { useChecker, useCheckerEditorInfo, useCheckerSelfTestDeleter, useCheckerSelfTests, useCheckerSelfTestUpserter, useCheckerUpdater } from "@/hooks/use-checker"
import { algorimejo } from "@/lib/algorimejo"
import { commands } from "@/lib/client"
import { cn } from "@/lib/utils"
import { getCheckerLanguageNames } from "./checker-languages"
import { checkerEditorDataSchema } from "./schema"

type BottomPanel = "tests" | "docs" | "build"

function fileUri(path: string) {
	return encodeURI(`file:///${path.replace(/\\/g, "/")}`)
}

function ToolButton({ title, children, ...props }: React.ComponentProps<typeof Button> & { title: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild><Button size="icon" variant="ghost" {...props}>{children}</Button></TooltipTrigger>
			<TooltipContent>{title}</TooltipContent>
		</Tooltip>
	)
}

export const CheckerEditor = withMainUIData(checkerEditorDataSchema, ({ data }) => {
	const checker = useChecker(data.checkerID)
	const editorInfo = useCheckerEditorInfo(data.checkerID, checker.data?.kind === "Custom")
	const [panel, setPanel] = useState<BottomPanel>("tests")
	const [buildResult, setBuildResult] = useState<CheckerBuildResult | null>(null)
	const [modified, setModified] = useState(false)
	const build = useMutation({ mutationFn: () => commands.buildChecker(data.checkerID) })

	useEffect(() => {
		if (!checker.data?.document)
			return
		const listener = ({ documentID }: { documentID: string }) => {
			if (documentID === checker.data?.document?.id)
				setModified(true)
		}
		algorimejo.events.on("documentChanged", listener)
		return () => algorimejo.events.off("documentChanged", listener)
	}, [checker.data?.document])

	async function handleBuild() {
		try {
			const result = await build.mutateAsync()
			setBuildResult(result)
			setModified(false)
			setPanel("build")
			if (result.status === "Ready")
				toast.success(result.cache_hit ? "Checker is ready" : "Checker built successfully")
		}
		catch (error) {
			toast.error(error instanceof Error ? error.message : String(error))
		}
	}

	function handleMetadataUpdated() {
		setBuildResult(null)
		setModified(true)
	}

	if (checker.status === "pending" || editorInfo.status === "pending") {
		return (
			<div className="space-y-2 p-4">
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-full w-full" />
			</div>
		)
	}
	if (checker.status === "error")
		return <ErrorLabel message={checker.error} location="loading checker" />
	if (checker.data.kind !== "Custom" || !checker.data.document || !checker.data.language)
		return <ErrorLabel message="Built-in checkers are read-only" />
	if (editorInfo.status === "error")
		return <ErrorLabel message={editorInfo.error} location="preparing checker SDK" />

	const status = build.isPending ? "Building" : modified ? "Modified" : buildResult?.status ?? "Not built"
	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<div className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
				<LucideCode2 className="size-4 text-muted-foreground" />
				<span className="truncate text-sm font-medium">{checker.data.name}</span>
				<span className="text-xs text-muted-foreground">{checker.data.scope === "Problem" ? "This Problem" : "Global"}</span>
				<span className="text-xs text-muted-foreground">{checker.data.language}</span>
				<span className="flex-1" />
				<span className={cn("text-xs", buildResult?.status === "CompileError" && "text-destructive")}>{status}</span>
				<CheckerMetadataDialog checker={checker.data} onUpdated={handleMetadataUpdated} />
				<ToolButton title="Build checker" onClick={handleBuild} disabled={build.isPending}><LucideHammer /></ToolButton>
				<ToolButton title="Run self tests" onClick={() => setPanel("tests")}><LucidePlay /></ToolButton>
			</div>
			<div className="min-h-0 flex-1">
				<CodeEditor
					className="size-full"
					documentID={checker.data.document.id}
					documentUri={fileUri(editorInfo.data.source_path)}
					language={checker.data.language}
				/>
			</div>
			<div className="flex h-64 shrink-0 flex-col border-t">
				<div className="flex h-8 shrink-0 items-center border-b px-1">
					<PanelButton active={panel === "tests"} onClick={() => setPanel("tests")} icon={<LucideCheck />}>Self Tests</PanelButton>
					<PanelButton active={panel === "docs"} onClick={() => setPanel("docs")} icon={<LucideBookOpen />}>SDK Reference</PanelButton>
					<PanelButton active={panel === "build"} onClick={() => setPanel("build")} icon={<LucideHammer />}>Build Output</PanelButton>
				</div>
				<div className="min-h-0 flex-1">
					{panel === "tests" && <SelfTestWorkbench checkerID={checker.data.id} />}
					{panel === "docs" && <ScrollArea className="h-full"><pre className="p-4 font-sans text-sm whitespace-pre-wrap">{editorInfo.data.sdk.documentation}</pre></ScrollArea>}
					{panel === "build" && <BuildOutput result={buildResult} />}
				</div>
			</div>
		</div>
	)
})

function CheckerMetadataDialog({ checker, onUpdated }: { checker: Checker, onUpdated: () => void }) {
	const [open, setOpen] = useState(false)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<span><ToolButton title="Checker settings"><LucideSettings2 /></ToolButton></span>
			</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogHeader><DialogTitle>Checker Settings</DialogTitle></DialogHeader>
				{open && <CheckerMetadataForm checker={checker} onUpdated={onUpdated} onClose={() => setOpen(false)} />}
			</DialogContent>
		</Dialog>
	)
}

function CheckerMetadataForm({ checker, onUpdated, onClose }: { checker: Checker, onUpdated: () => void, onClose: () => void }) {
	const [name, setName] = useState(checker.name)
	const [description, setDescription] = useState(checker.description ?? "")
	const [language, setLanguage] = useState(checker.language ?? "")
	const [scope, setScope] = useState<CheckerScope>(checker.scope)
	const languages = useAvailableLanguage()
	const languageNames = useMemo(() => getCheckerLanguageNames(languages.data), [languages.data])
	const updater = useCheckerUpdater(checker.id)

	async function handleSave() {
		try {
			const updated = await updater.mutateAsync({
				name: name.trim(),
				description: description.trim() || null,
				language,
				scope,
				owner_problem_id: scope === "Problem" ? checker.owner_problem_id : null,
			})
			const tabID = algorimejo.findCheckerTabID(checker.id)
			if (tabID)
				algorimejo.tab.renameTab(tabID, updated.name)
			onClose()
			onUpdated()
			toast.success("Checker settings saved")
		}
		catch (error) {
			toast.error(error instanceof Error ? error.message : String(error))
		}
	}

	return (
		<>
			<div className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor={`checker-name-${checker.id}`}>Name</Label>
					<Input id={`checker-name-${checker.id}`} value={name} onChange={event => setName(event.target.value)} autoFocus />
				</div>
				<div className="space-y-2">
					<Label htmlFor={`checker-description-${checker.id}`}>Description</Label>
					<Textarea id={`checker-description-${checker.id}`} className="min-h-20 resize-y" value={description} onChange={event => setDescription(event.target.value)} />
				</div>
				<div className="space-y-2">
					<Label>Language</Label>
					<Select value={language} onValueChange={setLanguage}>
						<SelectTrigger><SelectValue /></SelectTrigger>
						<SelectContent>{languageNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
					</Select>
					{language !== checker.language && <p className="text-xs text-muted-foreground">The current source is preserved. Update it to use the new language SDK.</p>}
				</div>
				<div className="space-y-2">
					<Label>Scope</Label>
					{checker.scope === "Problem"
						? (
								<ToggleGroup type="single" variant="outline" value={scope} onValueChange={value => value && setScope(value as CheckerScope)} className="w-full">
									<ToggleGroupItem value="Problem">This Problem</ToggleGroupItem>
									<ToggleGroupItem value="Global">Global</ToggleGroupItem>
								</ToggleGroup>
							)
						: <div className="rounded-md border px-3 py-2 text-sm">Global</div>}
					{checker.scope === "Problem" && scope === "Global" && <p className="text-xs text-muted-foreground">This Checker will become available to every problem in this workspace.</p>}
				</div>
			</div>
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
				<Button type="button" onClick={handleSave} disabled={updater.isPending || !name.trim() || !language}>Save</Button>
			</DialogFooter>
		</>
	)
}

function PanelButton({ active, icon, children, ...props }: React.ComponentProps<"button"> & { active: boolean, icon: React.ReactNode }) {
	return (
		<button type="button" className={cn("flex h-full items-center gap-1 border-b-2 px-3 text-xs", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")} {...props}>
			{icon}
			{children}
		</button>
	)
}

function BuildOutput({ result }: { result: CheckerBuildResult | null }) {
	if (!result)
		return <div className="p-4 text-sm text-muted-foreground">No build output</div>
	return (
		<ScrollArea className="h-full">
			<div className="space-y-2 p-3 font-mono text-xs whitespace-pre-wrap">
				<div>
					{result.status}
					{" "}
					/ exit
					{" "}
					{result.exit_code}
					{result.cache_hit ? " / cached" : ""}
				</div>
				{result.stdout && <pre>{result.stdout}</pre>}
				{result.stderr && <pre className="text-destructive">{result.stderr}</pre>}
			</div>
		</ScrollArea>
	)
}

function emptySelfTest(checkerID: string): UpsertCheckerSelfTestParams {
	return {
		id: null,
		checker_id: checkerID,
		name: "New Test",
		expected_verdict: "AC",
		input: "",
		output: "",
		answer: "",
	}
}

function SelfTestWorkbench({ checkerID }: { checkerID: string }) {
	const tests = useCheckerSelfTests(checkerID)
	const upsert = useCheckerSelfTestUpserter(checkerID)
	const deleter = useCheckerSelfTestDeleter(checkerID)
	const [selectedID, setSelectedID] = useState<string | null>(null)
	const [draft, setDraft] = useState<UpsertCheckerSelfTestParams>(() => emptySelfTest(checkerID))
	const [results, setResults] = useState<Record<string, CheckerSelfTestResult>>({})
	const [running, setRunning] = useState(false)

	async function saveDraft() {
		const saved = await upsert.mutateAsync(draft)
		setSelectedID(saved.id)
		setDraft({ ...saved })
		return saved
	}

	function handleNewSelfTest() {
		setSelectedID(null)
		setDraft(emptySelfTest(checkerID))
	}

	function handleSelectSelfTest(test: CheckerSelfTest) {
		setSelectedID(test.id)
		setDraft({ ...test })
	}

	async function handleDeleteSelfTest() {
		if (!selectedID)
			return
		try {
			await deleter.mutateAsync(selectedID)
			handleNewSelfTest()
		}
		catch (error) {
			toast.error(error instanceof Error ? error.message : String(error))
		}
	}

	async function runOne(test: CheckerSelfTest) {
		const result = await commands.runCheckerSelfTest(test.id)
		setResults(current => ({ ...current, [test.id]: result }))
	}

	async function handleRunCurrent() {
		setRunning(true)
		try {
			const test = await saveDraft()
			await runOne(test)
		}
		catch (error) {
			toast.error(error instanceof Error ? error.message : String(error))
		}
		finally {
			setRunning(false)
		}
	}

	async function handleRunAll() {
		setRunning(true)
		try {
			for (const test of tests.data ?? [])
				await runOne(test)
		}
		catch (error) {
			toast.error(error instanceof Error ? error.message : String(error))
		}
		finally {
			setRunning(false)
		}
	}

	if (tests.status === "pending")
		return <Skeleton className="size-full" />
	if (tests.status === "error")
		return <ErrorLabel message={tests.error} />

	return (
		<div className="flex h-full min-h-0">
			<div className="flex w-56 shrink-0 flex-col border-r">
				<div className="flex h-9 items-center gap-1 border-b px-1">
					<ToolButton title="New self test" onClick={handleNewSelfTest}><LucidePlus /></ToolButton>
					<ToolButton title="Run all self tests" onClick={handleRunAll} disabled={running || tests.data.length === 0}><LucidePlay /></ToolButton>
				</div>
				<ScrollArea className="min-h-0 flex-1">
					{tests.data.map(test => (
						<button key={test.id} type="button" className={cn("flex w-full items-center gap-2 border-b px-3 py-2 text-left text-xs hover:bg-secondary", selectedID === test.id && "bg-secondary")} onClick={() => handleSelectSelfTest(test)}>
							<span className={cn("size-2 rounded-full bg-muted-foreground", results[test.id]?.passed && "bg-green-600", results[test.id] && !results[test.id].passed && "bg-destructive")} />
							<span className="min-w-0 flex-1 truncate">{test.name}</span>
							<span className="text-muted-foreground">{test.expected_verdict}</span>
						</button>
					))}
				</ScrollArea>
			</div>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="flex h-9 items-center gap-2 border-b px-2">
					<Input className="h-7 max-w-52" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
					<Select value={draft.expected_verdict} onValueChange={value => setDraft(current => ({ ...current, expected_verdict: value }))}>
						<SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
						<SelectContent>{["AC", "WA", "PE", "CHKRE"].map(verdict => <SelectItem key={verdict} value={verdict}>{verdict}</SelectItem>)}</SelectContent>
					</Select>
					<span className="flex-1 truncate text-xs text-muted-foreground">{selectedID && results[selectedID] ? `${results[selectedID].run.verdict}: ${results[selectedID].run.message}` : ""}</span>
					<ToolButton title="Save self test" onClick={() => saveDraft().catch(error => toast.error(String(error)))} disabled={upsert.isPending}><LucideSave /></ToolButton>
					<ToolButton title="Run self test" onClick={handleRunCurrent} disabled={running}><LucidePlay /></ToolButton>
					<ToolButton title="Delete self test" variant="ghost" disabled={!selectedID || deleter.isPending} onClick={handleDeleteSelfTest}><LucideTrash2 /></ToolButton>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-3">
					<SelfTestText label="Input" value={draft.input} onChange={value => setDraft(current => ({ ...current, input: value }))} />
					<SelfTestText label="Contestant Output" value={draft.output} onChange={value => setDraft(current => ({ ...current, output: value }))} />
					<SelfTestText label="Answer" value={draft.answer} onChange={value => setDraft(current => ({ ...current, answer: value }))} />
				</div>
			</div>
		</div>
	)
}

function SelfTestText({ label, value, onChange }: { label: string, value: string, onChange: (value: string) => void }) {
	return (
		<label className="flex min-w-0 flex-col border-r last:border-r-0">
			<span className="px-2 py-1 text-xs text-muted-foreground">{label}</span>
			<Textarea className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs focus-visible:ring-0" value={value} onChange={event => onChange(event.target.value)} />
		</label>
	)
}
