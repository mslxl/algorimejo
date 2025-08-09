import type { Language } from "./language"
import { text } from "node:stream/consumers"
import * as log from "@tauri-apps/plugin-log"

import CodeMirror, { basicSetup } from "@uiw/react-codemirror"
import { capitalize, debounce } from "lodash/fp"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "react-toastify"
import { yCollab, YSyncConfig } from "y-codemirror.next"
import * as Y from "yjs"
import { commands } from "@/lib/client"
import { cn } from "@/lib/utils"
import { ErrorLabel } from "../error-label"
import { Skeleton } from "../ui/skeleton"
import { useLanguageExtension } from "./language"

interface CodeEditorProps {
	className?: string
	documentID: string
	language?: string
	textarea?: boolean
}
export function CodeEditor({
	className,
	documentID,
	language = "text",
	textarea,
}: CodeEditorProps) {
	const [isDocumentLoaded, setIsDocumentLoaded] = useState(false)
	const ydoc = useMemo(() => {
		const doc = new Y.Doc()

		commands.loadDocument(documentID).then((data) => {
			setIsDocumentLoaded(true)
			const updates = new Uint8Array(data)
			Y.applyUpdate(doc, updates)
			const content = doc.getText("content")
			log.trace(`content of document ${documentID}: ${content.toString()}`)
		}).catch((reason) => {
			if (reason instanceof Error) {
				toast.error(`failed to load document ${documentID}: ${reason.message}`)
			}
			else {
				toast.error(`failed to load document ${documentID}: ${reason}`)
			}
		})

		return doc
	}, [documentID])

	const ytext = useMemo(() => ydoc.getText("content"), [ydoc])

	const undoManager = useMemo(() => new Y.UndoManager(ytext), [ytext])

	useEffect(() => {
		const cb = (update: Uint8Array, origin: any, _doc: Y.Doc, _transaction: Y.Transaction) => {
			if (origin instanceof YSyncConfig) {
				commands.applyChange(documentID, Array.from(update)).catch((e) => {
					toast.error(`failed to apply change with local error message: ${e}`)
				})
			}
		}
		ydoc.on("update", cb)
		return () => {
			ydoc.off("update", cb)
		}
	}, [ydoc, documentID])

	const languageExtension = useLanguageExtension(capitalize(language) as Language)
	if (languageExtension.status === "error") {
		return <ErrorLabel message={languageExtension.error.message} />
	}
	else if (languageExtension.status === "pending" || !isDocumentLoaded) {
		return (
			<div className="space-y-1 p-2">
				<Skeleton className="h-[1em] w-full" />
				<Skeleton className="h-[1em] w-full" />
				<Skeleton className="h-[1em] w-full" />
				<Skeleton className="h-[1em] w-full" />
				<Skeleton className="h-[1em] w-full" />
			</div>
		)
	}

	return (
		<CodeMirror
			height="100%"
			value={ytext.toString()}
			basicSetup={{
				lineNumbers: !textarea,
				foldGutter: !textarea,
				indentOnInput: !textarea,
			}}
			extensions={[
				yCollab(ytext, null, {
					undoManager,
				}),
				languageExtension.data,
			]}
			data-language={language}
			className={cn(className, "codemirror-container")}
		/>
	)
}
