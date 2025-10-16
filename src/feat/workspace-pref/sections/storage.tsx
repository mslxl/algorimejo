import { PrefsItem, PrefsSection } from "@/components/prefs"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useWorkspacePrefsChangeset, useWorkspacePrefsChangesetApply, useWorkspacePrefsChangesetSetter } from "../workspace-prefs-changeset-context"

export function StorageSection() {
	const changeset = useWorkspacePrefsChangeset()!
	const updateChangeset = useWorkspacePrefsChangesetSetter()!
	const applyChangeset = useWorkspacePrefsChangesetApply()!
	return (
		<PrefsSection section="Storage">
			<PrefsItem name="Duplicated Save" description="Save a duplicate copy of the save file in raw text when saving">
				<Switch
					checked={changeset.duplicate_save}
					onCheckedChange={
						value => updateChangeset((draft) => {
							draft.duplicate_save = value
						}, true)
					}
				/>
			</PrefsItem>
			<PrefsItem name="Duplicated Save Location" description="The location to save the duplicate copy. If empty, it will be saved in the same directory as the original save file.">
				<Input
					type="text"
					value={changeset.duplicate_save_location ?? ""}
					placeholder="Path to save the duplicate copy"
					onChange={e => updateChangeset((draft) => {
						draft.duplicate_save_location = e.target.value.trim() === "" ? null : e.target.value.trim()
					})}
					onBlur={() => applyChangeset()}
				/>
			</PrefsItem>
		</PrefsSection>
	)
}
