import { makeStateSelector } from "@/lib/algorimejo/algorimejo";
import { monacoEditorPageDataSchema } from "./editor";

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
export const selectMonacoDocumentTabIndex = (documentID: string) =>
	makeStateSelector((state) => {
		return state.tab.tabs.findIndex((t) => {
			if (t.key !== "editor") return false;
			const result = monacoEditorPageDataSchema.safeParse(t.data);
			if (!result.success) return false;
			return result.data.documentID === documentID;
		});
	});
