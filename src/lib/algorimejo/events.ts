import type { Text } from "yjs"
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
	documentChanged: { documentID: string, ytext: Text }
	documentChangedDebounced: { documentID: string, ytext: Text }
}
