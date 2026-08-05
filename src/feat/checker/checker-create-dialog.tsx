import type { Checker, CheckerScope } from "@/lib/client"
import { LucidePlus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "react-toastify"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useAvailableLanguage } from "@/hooks/use-available-language"
import { useCheckerCreator } from "@/hooks/use-checker"
import { commands } from "@/lib/client"
import { getCheckerLanguageNames } from "./checker-languages"

interface CheckerCreateDialogProps {
	problemID?: string
	globalOnly?: boolean
	onCreated?: (checker: Checker) => void
}

export function CheckerCreateDialog({ problemID, globalOnly = false, onCreated }: CheckerCreateDialogProps) {
	const [open, setOpen] = useState(false)
	const [name, setName] = useState("New Checker")
	const [scope, setScope] = useState<CheckerScope>(globalOnly ? "Global" : "Problem")
	const languages = useAvailableLanguage()
	const languageNames = useMemo(() => getCheckerLanguageNames(languages.data), [languages.data])
	const [language, setLanguage] = useState("")
	const selectedLanguage = language || languageNames[0] || ""
	const creator = useCheckerCreator()

	async function handleCreate() {
		if (!name.trim() || !selectedLanguage)
			return
		try {
			const sdk = await commands.getCheckerSdkInfo(selectedLanguage)
			const result = await creator.mutateAsync({
				name: name.trim(),
				language: selectedLanguage,
				description: null,
				content: sdk.template,
				scope,
				owner_problem_id: scope === "Problem" ? problemID ?? null : null,
			})
			setOpen(false)
			onCreated?.(result.checker)
		}
		catch (error) {
			toast.error(error instanceof Error ? error.message : String(error))
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button type="button" variant="outline" size="icon" title="New checker">
					<LucidePlus />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>New Checker</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="checker-name">Name</Label>
						<Input id="checker-name" value={name} onChange={event => setName(event.target.value)} autoFocus />
					</div>
					{!globalOnly && (
						<div className="space-y-2">
							<Label>Scope</Label>
							<ToggleGroup type="single" variant="outline" value={scope} onValueChange={value => value && setScope(value as CheckerScope)} className="w-full">
								<ToggleGroupItem value="Problem">This Problem</ToggleGroupItem>
								<ToggleGroupItem value="Global">Global</ToggleGroupItem>
							</ToggleGroup>
						</div>
					)}
					<div className="space-y-2">
						<Label>Language</Label>
						<Select value={selectedLanguage} onValueChange={setLanguage}>
							<SelectTrigger><SelectValue /></SelectTrigger>
							<SelectContent>
								{languageNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
							</SelectContent>
						</Select>
						{languages.status === "success" && languageNames.length === 0 && (
							<p className="text-xs text-destructive">Configure a C++, Python, JavaScript, TypeScript, or Go language first.</p>
						)}
					</div>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
					<Button type="button" onClick={handleCreate} disabled={creator.isPending || !name.trim() || !selectedLanguage}>Create</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
