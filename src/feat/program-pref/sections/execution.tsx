import type { DetachedRunMode } from "@/lib/client"
import { PrefsItem, PrefsSection } from "@/components/prefs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useProgramPrefsChangeset, useProgramPrefsChangesetSetter } from "../program-prefs-changeset-context"

export function ExecutionSection() {
	const changeset = useProgramPrefsChangeset()!
	const updateChangeset = useProgramPrefsChangesetSetter()!

	return (
		<PrefsSection section="Execution">
			<PrefsItem name="Run Detached With" description="Where detached programs are run">
				<Select
					value={changeset.detached_run_mode}
					onValueChange={(value) => {
						updateChangeset((draft) => {
							draft.detached_run_mode = value as DetachedRunMode
						}, true)
					}}
				>
					<SelectTrigger className="w-56">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="EmbeddedTerminal">Embedded terminal</SelectItem>
						<SelectItem value="ExternalTerminal">External terminal</SelectItem>
					</SelectContent>
				</Select>
			</PrefsItem>
		</PrefsSection>
	)
}
