import * as z from "zod"

export const editorPageDataSchema = z.object({
	documentID: z.string(),
	language: z.string().default("Text"),
	problemID: z.string(),
	solutionID: z.string(),
})

export const solutionEditorPageDataSchema = z.object({
	solutionID: z.string(),
	problemID: z.string(),
})
