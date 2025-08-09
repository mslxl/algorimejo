import { MonacoCodeEditor } from "@/components/monaco"
import { withMainUIData } from "@/components/zod-main-ui-data-checker"
import { monacoEditorPageDataSchema } from "./schema"

export const Editor = withMainUIData(monacoEditorPageDataSchema, (data) => {
	return (
		<MonacoCodeEditor
			documentID={data.data.documentID}
			language={data.data.language}
		/>
	)
})
