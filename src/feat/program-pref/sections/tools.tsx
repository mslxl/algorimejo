import { PrefsItem, PrefsSection } from "@/components/prefs"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { commands } from "@/lib/client"
import { useProgramPrefsChangeset, useProgramPrefsChangesetApply, useProgramPrefsChangesetSetter } from "../program-prefs-changeset-context"

export function ToolsSection() {
	const changeset = useProgramPrefsChangeset()!
	const updateChangeset = useProgramPrefsChangesetSetter()!
	const applyChangeset = useProgramPrefsChangesetApply()!

	async function changeCompetitiveCompanionEnabled(value: boolean) {
		if (value) {
			await commands.launchCompetitiveCompanionListener(changeset.competitive_companion_addr)
		}
		else {
			await commands.shutdownCompetitiveCompanionListener()
		}
		updateChangeset((draft) => {
			draft.competitive_companion_enabled = value
		}, true)
	}
	async function applyCompetitiveCompanionAddr() {
		await applyChangeset()
		if (changeset.competitive_companion_enabled) {
			await commands.shutdownCompetitiveCompanionListener()
			await commands.launchCompetitiveCompanionListener(changeset.competitive_companion_addr)
		}
	}
	return (

		<PrefsSection section="External Tools">
			<PrefsItem name="Competitive Companion" description="Whether to use the competitive companion">
				<Switch
					checked={changeset.competitive_companion_enabled}
					onCheckedChange={changeCompetitiveCompanionEnabled}
				/>
			</PrefsItem>
			<PrefsItem name="Competitive Companion Listener Host" description="The address of the competitive companion listener">
				<Input
					value={changeset.competitive_companion_addr}
					onChange={(e) => {
						updateChangeset((draft) => {
							draft.competitive_companion_addr = e.target.value
						}, false)
					}}
					onBlur={applyCompetitiveCompanionAddr}
				/>
			</PrefsItem>
		</PrefsSection>
	)
}
