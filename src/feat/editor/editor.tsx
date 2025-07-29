import * as z from "zod";
import { MonacoEditor } from "@/components/monaco";
import { withMainUIData } from "@/components/zod-main-ui-data-checker";

export const monacoEditorPageDataSchema = z.object({
	documentID: z.string(),
});

export const Editor = withMainUIData(monacoEditorPageDataSchema, (data) => {
	return <MonacoEditor documentID={data.data.documentID} />;
});
