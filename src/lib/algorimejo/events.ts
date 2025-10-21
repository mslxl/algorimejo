import type { Text } from "yjs"
import type { ProgramConfig, WorkspaceConfig } from "../client"
// eslint-disable-next-line ts/consistent-type-definitions
export type AlgorimejoEvents = {
	ready: void
	tabOpened: {
		key: string
		tabID: string
		data: unknown
	}
	tabClosed: {
		tabID: string
		key: string
		data: unknown
	}
	tabSelected: {
		tabID: string
		key: string
		data: unknown
	}
	documentChanged: { documentID: string, ytext: Text, language: string }
	documentChangedDebounced: { documentID: string, ytext: Text, language: string }
	solutionDocumentChangedDebounced: { problemID: string, solutionID: string, documentID: string, ytext: Text, language: string }
	workspaceConfigChanged: { config: WorkspaceConfig }
	programConfigChanged: { config: ProgramConfig }
}
