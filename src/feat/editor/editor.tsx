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
			language={data.data.language}
		/>
	)
})

export const SolutionEditor = withMainUIData(solutionEditorPageDataSchema, (data) => {
	const sol = useSolution(data.data.solutionID, data.data.problemID)
	useEffect(() => {
		if (sol.status !== "success")
			return () => {}
		const forwardEvent = ({ documentID, ytext, language }: AlgorimejoEvents["documentChangedDebounced"]) => {
			if (documentID === sol.data.document?.id) {
				algorimejo.events.emit("solutionDocumentChangedDebounced", {
					problemID: data.data.problemID,
					solutionID: data.data.solutionID,
					documentID,
					ytext,
					language,
				})
			}
		}
		algorimejo.events.on("documentChangedDebounced", forwardEvent)

		return () => {
			algorimejo.events.off("documentChangedDebounced")
		}
	}, [sol, data.data])

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
