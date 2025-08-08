import * as z from "zod";
import { MonacoCodeEditor } from "@/components/monaco";
import { withMainUIData } from "@/components/zod-main-ui-data-checker";

export const monacoEditorPageDataSchema = z.object({
	documentID: z.string(),
	language: z.string().default("text"),
	problemID: z.string(),
	solutionID: z.string(),
});

export const Editor = withMainUIData(monacoEditorPageDataSchema, (data) => {
	return (
		<MonacoCodeEditor
			documentID={data.data.documentID}
			language={data.data.language}
		/>
	);
});
