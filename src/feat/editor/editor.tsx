import { CodeEditor } from "@/components/editor"
import { withMainUIData } from "@/components/zod-main-ui-data-checker"
import { monacoEditorPageDataSchema } from "./schema"

export const Editor = withMainUIData(monacoEditorPageDataSchema, (data) => {
	return (
		<CodeEditor
			documentID={data.data.documentID}
			language={data.data.language}
		/>
	)
})
