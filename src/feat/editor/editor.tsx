import type { AlgorimejoEvents } from "@/lib/algorimejo/events"
import { useEffect } from "react"
import { CodeEditor } from "@/components/editor"
import { ErrorLabel } from "@/components/error-label"
import { withMainUIData } from "@/components/zod-main-ui-data-checker"
import { useSolution } from "@/hooks/use-solution"
import { algorimejo } from "@/lib/algorimejo"
import { editorPageDataSchema, solutionEditorPageDataSchema } from "./schema"

const Editor = withMainUIData(editorPageDataSchema, (data) => {
	return (
		<CodeEditor
			documentID={data.data.documentID}
			entityName={data.data.entityName}
			language={data.data.language}
		/>
	)
})

export const SolutionEditor = withMainUIData(solutionEditorPageDataSchema, (data) => {
	const sol = useSolution(data.data.solutionID, data.data.problemID)
	const documentID = sol.data?.document?.id
	const problemID = data.data.problemID
	const solutionID = data.data.solutionID
	useEffect(() => {
		if (!documentID)
			return () => {}
		const forwardEvent = ({ documentID: changedDocumentID, ytext, language }: AlgorimejoEvents["documentChangedDebounced"]) => {
			if (changedDocumentID === documentID) {
				algorimejo.events.emit("solutionDocumentChangedDebounced", {
					problemID,
					solutionID,
					documentID: changedDocumentID,
					ytext,
					language,
				})
			}
		}
		algorimejo.events.on("documentChangedDebounced", forwardEvent)

		return () => {
			algorimejo.events.off("documentChangedDebounced", forwardEvent)
		}
	}, [documentID, problemID, solutionID])

	if (sol.status === "error") {
		return <ErrorLabel message={sol.error} location={`editor loading solution info for ${data.data.solutionID} of problem ${data.data.problemID}`} />
	}
	else if (sol.status === "pending") {
		return <></>
	}

	return (
		<Editor data={{
			documentID: sol.data.document!.id,
			entityName: sol.data.name,
			language: sol.data.language,
			problemID: data.data.problemID,
			solutionID: data.data.solutionID,
		}}
		/>
	)
})
