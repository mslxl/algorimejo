import { LoaderCircleIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { PrefsItem, PrefsSection } from "@/components/prefs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { commands } from "@/lib/client"
import { useProgramPrefsChangeset, useProgramPrefsChangesetApply, useProgramPrefsChangesetSetter } from "../program-prefs-changeset-context"

export function ToolsSection() {
	const changeset = useProgramPrefsChangeset()!
	const updateChangeset = useProgramPrefsChangesetSetter()!
	const applyChangeset = useProgramPrefsChangesetApply()!
	const [isTestingWakatime, setIsTestingWakatime] = useState(false)

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
	async function testWakatimeCli() {
		setIsTestingWakatime(true)
		try {
			const version = await commands.checkWakatimeCli(changeset.wakatime_cli_path)
			toast.success(`WakaTime CLI: ${version}`)
		}
		catch (error) {
			toast.error(`WakaTime CLI: ${error instanceof Error ? error.message : String(error)}`)
		}
		finally {
			setIsTestingWakatime(false)
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
			<PrefsItem name="WakaTime" description="Send coding activity through wakatime-cli. Uses the API key from ~/.wakatime.cfg.">
				<Switch
					checked={changeset.wakatime_enabled}
					onCheckedChange={value => updateChangeset((draft) => {
						draft.wakatime_enabled = value
					}, true)}
				/>
			</PrefsItem>
			<PrefsItem name="WakaTime CLI" description="Executable name or absolute path to wakatime-cli">
				<div className="flex items-center gap-2">
					<Input
						value={changeset.wakatime_cli_path}
						placeholder="wakatime-cli"
						onChange={event => updateChangeset((draft) => {
							draft.wakatime_cli_path = event.target.value
						})}
						onBlur={() => applyChangeset()}
					/>
					<Button type="button" variant="outline" onClick={testWakatimeCli} disabled={isTestingWakatime}>
						{isTestingWakatime && <LoaderCircleIcon className="animate-spin" />}
						Test
					</Button>
				</div>
			</PrefsItem>
		</PrefsSection>
	)
}
