import { CodeEditor } from "@/components/editor"
import { ErrorLabel } from "@/components/error-label"
import { withMainUIData } from "@/components/zod-main-ui-data-checker"
import { useSolution } from "@/hooks/use-solution"
import { editorPageDataSchema, solutionEditorPageDataSchema } from "./schema"

const Editor = withMainUIData(editorPageDataSchema, (data) => {
	return (
		<CodeEditor
			documentID={data.data.documentID}
			language={data.data.language}
		/>
	)
})

export const SolutionEditor = withMainUIData(solutionEditorPageDataSchema, (data) => {
	const sol = useSolution(data.data.solutionID, data.data.problemID)
	if (sol.status === "error") {
		return <ErrorLabel message={sol.error} location={`editor loading solution info for ${data.data.solutionID} of problem ${data.data.problemID}`} />
	}
	else if (sol.status === "pending") {
		return <></>
	}
	return (
		<Editor data={{
			documentID: sol.data.document!.id,
			language: sol.data.language,
			problemID: data.data.problemID,
			solutionID: data.data.solutionID,
		}}
		/>
	)
})
