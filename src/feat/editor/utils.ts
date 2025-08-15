import { makeStateSelector } from "@/lib/algorimejo/algorimejo"
import { editorPageDataSchema, solutionEditorPageDataSchema } from "./schema"

/**
 * Select the tab index of the monaco editor tab that contains the given documentID
 * The tab data is stored in redux store
 *
 * Example:
 * useAppSelector(selectMonacoDocumentTabIndex("123")) // -1 if no such tab is found
 * algorimejo.selectStateValue(selectMonacoDocumentTabIndex("123")) // -1 if no such tab is found
 *
 * @param documentID
 * @returns -1 if no such tab is found
 */
export function selectEditorDocumentTabIndex(documentID: string) {
	return makeStateSelector((state) => {
		return state.tab.tabs.findIndex((t) => {
			if (t.key !== "editor")
				return false
			const result = editorPageDataSchema.safeParse(t.data)
			if (!result.success)
				return false
			return result.data.documentID === documentID
		})
	})
}

export function selectSolutionEditorTabIndex(solutionID: string) {
	return makeStateSelector((state) => {
		return state.tab.tabs.findIndex((t) => {
			if (t.key !== "solution-editor")
				return false
			const result = solutionEditorPageDataSchema.safeParse(t.data)
			if (!result.success)
				return false
			return result.data.solutionID === solutionID
		})
	})
}
