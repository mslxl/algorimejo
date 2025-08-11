import { PrefsItem, PrefsSection } from "@/components/prefs"
import { getAvailableThemes } from "@/components/themes/theme"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkspacePrefsChangeset, useWorkspacePrefsChangesetApply, useWorkspacePrefsChangesetSetter } from "../prefs-changeset-context"

export function WorkspaceEditorSection() {
	const changeset = useWorkspacePrefsChangeset()!
	const updateChangeset = useWorkspacePrefsChangesetSetter()!
	const applyChangeset = useWorkspacePrefsChangesetApply()!
	return (
		<PrefsSection section="Editor">
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
			<PrefsItem name="Font Size" description="The size of the font in the editor">
				<Input
					type="number"
					min={1}
					max={100}
					value={changeset.font_size}
					onInput={e => updateChangeset((draft) => { draft.font_size = Number(e.currentTarget.value) })}
					onBlur={() => applyChangeset()}
				/>
			</PrefsItem>
			<PrefsItem name="Font Family" description="The font family in the editor">
				<Input
					type="text"
					value={changeset.font_family}
					onInput={e => updateChangeset((draft) => { draft.font_family = e.currentTarget.value })}
					onBlur={() => applyChangeset()}
				/>
			</PrefsItem>
		</PrefsSection>
	)
}
