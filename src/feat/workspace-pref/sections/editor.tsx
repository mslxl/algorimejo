import { PrefsItem, PrefsSection } from "@/components/prefs"
import { Input } from "@/components/ui/input"
import { useWorkspacePrefsChangeset, useWorkspacePrefsChangesetApply, useWorkspacePrefsChangesetSetter } from "../workspace-prefs-changeset-context"

export function EditorSection() {
	const changeset = useWorkspacePrefsChangeset()!
	const updateChangeset = useWorkspacePrefsChangesetSetter()!
	const applyChangeset = useWorkspacePrefsChangesetApply()!
	return (
		<PrefsSection section="Editor">
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
