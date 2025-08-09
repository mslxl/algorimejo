import * as z from "zod"

export const monacoEditorPageDataSchema = z.object({
	documentID: z.string(),
	language: z.string().default("text"),
	problemID: z.string(),
	solutionID: z.string(),
})
