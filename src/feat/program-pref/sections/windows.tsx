import { PrefsItem, PrefsSection } from "@/components/prefs"
import { getAvailableThemes } from "@/components/themes/theme"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useProgramPrefsChangeset, useProgramPrefsChangesetApply, useProgramPrefsChangesetSetter } from "../program-prefs-changeset-context"

export function WindowsSection() {
	const changeset = useProgramPrefsChangeset()!
	const updateChangeset = useProgramPrefsChangesetSetter()!
	const applyChangeset = useProgramPrefsChangesetApply()!
	return (
		<PrefsSection section="Windows">
			<PrefsItem name="Theme" description="The theme of the editor">
				<Select
					value={changeset.theme}
					onValueChange={value => updateChangeset((draft) => { draft.theme = value })}
				>
					<SelectTrigger>
						<SelectValue placeholder="Select a theme" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="default">Default(Zinc Light)</SelectItem>
						{getAvailableThemes().map(theme => (
							<SelectItem key={theme.value} value={theme.value}>
								{theme.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button onClick={() => applyChangeset()}>Apply</Button>
			</PrefsItem>
			<PrefsItem name="System Titlebar" description="Whether to use the system titlebar">
				<Switch
					checked={changeset.system_titlebar}
					onCheckedChange={(value) => {
						updateChangeset((draft) => {
							draft.system_titlebar = value
						}, true)
					}}
				/>
				<p className="text-sm text-muted-foreground italic">* Effect after restart</p>
			</PrefsItem>
		</PrefsSection>
	)
}
