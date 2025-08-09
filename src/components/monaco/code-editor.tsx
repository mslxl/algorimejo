import type { HTMLAttributes } from "react"
import * as log from "@tauri-apps/plugin-log"
import * as monaco from "monaco-editor"
import { useEffect, useRef } from "react"
import { toast } from "react-toastify"
import { MonacoBinding } from "y-monaco"
import * as Y from "yjs"
import { commands } from "@/lib/client"
import { cn } from "@/lib/utils"
import "@/components/monaco/env"

interface MonacoEditor extends HTMLAttributes<HTMLDivElement> {
	documentID: string
	language?: string
}
export function MonacoCodeEditor({
	className,
	documentID,
	language = "text",
	...props
}: MonacoEditor) {
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!ref.current) {
			toast.error("[Internal Error]: Monaco Container should not be null")
			return
		}
		const ydocument = new Y.Doc()

		const editor = monaco.editor.create(ref.current, {
			language,
			automaticLayout: true,
		})

		commands.loadDocument(documentID).then((data) => {
			const uint8Array = new Uint8Array(data)
			Y.applyUpdate(ydocument, uint8Array)

			const content = ydocument.getText("content")

			log.trace(
				`content of document ${documentID}: ${JSON.stringify(content.toString())}`,
			)
			const _binding = new MonacoBinding(
				content,
				editor.getModel()!,
				new Set([editor]),
				null, // TODO: add awareness from provider
			)
		})

		ydocument.on("update", (update, origin, _doc, _transaction) => {
			if (origin instanceof MonacoBinding) {
				commands.applyChange(documentID, Array.from(update)).catch((e) => {
					toast.error(`failed to apply change with local error message: ${e}`)
				})
			}
		})

		return () => {
			editor.dispose()
		}
	}, [documentID, language])

	return (
		<div
			className={cn(className, "monaco-container")}
			data-language={language}
			{...props}
			ref={ref}
		>
		</div>
	)
}
