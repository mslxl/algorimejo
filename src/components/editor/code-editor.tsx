import type { Extension } from "@codemirror/state"
import { indentWithTab } from "@codemirror/commands"
import { Compartment, EditorState } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import * as log from "@tauri-apps/plugin-log"
import { basicSetup } from "@uiw/codemirror-extensions-basic-setup"
import { debounce } from "lodash/fp"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "react-toastify"
import { yCollab, YSyncConfig } from "y-codemirror.next"
import * as Y from "yjs"
import { useProgramConfig } from "@/hooks/use-program-config"
import { useWorkspaceConfig } from "@/hooks/use-workspace-config"
import { algorimejo } from "@/lib/algorimejo"
import { commands } from "@/lib/client"
import { getFileExtensionOfLanguage, textLanguageItem } from "@/lib/client/type"
import { ErrorLabel } from "../error-label"
import { Skeleton } from "../ui/skeleton"
import { configExtension } from "./config-extension"
import { useLanguageExtension } from "./language"

interface CodeEditorProps {
	className?: string
	documentID: string
	documentUri?: string
	entityName?: string
	language?: string
	textarea?: boolean
}

function localPathToFileUri(path: string): string {
	const normalized = path.replace(/\\/g, "/")
	if (normalized.startsWith("//")) {
		const [host, ...segments] = normalized.slice(2).split("/")
		return `file://${host}/${segments.map(encodeURIComponent).join("/")}`
	}

	const absolute = normalized.startsWith("/") ? normalized : `/${normalized}`
	const encoded = absolute
		.split("/")
		.map(segment => /^[a-z]:$/i.test(segment) ? segment : encodeURIComponent(segment))
		.join("/")
	return `file://${encoded}`
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`
}

export function CodeEditorSuspend({ className, documentID, documentUri, entityName = documentID, language = "Text", textarea }: CodeEditorProps) {
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
	useEffect(() => {
		if (isDocumentLoaded) {
			algorimejo.events.emit("documentOpened", { documentID, entityName, language })
		}
	}, [documentID, entityName, isDocumentLoaded, language])

	// eslint-disable-next-line react-hooks/exhaustive-deps
	const emitDocumentChangeEventDebounced = useCallback(debounce(2000, () => {
		algorimejo.events.emit("documentChangedDebounced", { documentID, entityName, ytext, language })
	}), [ydoc, documentID, entityName, language])

	useEffect(() => {
		const cb = (update: Uint8Array, origin: any, _doc: Y.Doc, _transaction: Y.Transaction) => {
			if (origin instanceof YSyncConfig) {
				commands.applyChange(documentID, Array.from(update)).catch((e) => {
					toast.error(`failed to apply change with local error message: ${e}`)
				})

				algorimejo.events.emit("documentChanged", { documentID, entityName, ytext, language })
				emitDocumentChangeEventDebounced()
			}
		}
		ydoc.on("update", cb)
		return () => {
			ydoc.off("update", cb)
		}
	}, [ydoc, documentID, emitDocumentChangeEventDebounced, entityName, ytext, language])

	const workspaceConfig = useWorkspaceConfig()
	const programConfig = useProgramConfig()

	const workspaceLangCfg = useMemo(() => workspaceConfig.data?.language ?? {}, [workspaceConfig.data])
	const languageItem = workspaceLangCfg[language] ?? textLanguageItem

	// Load language
	// if user set language to Text, use Text
	// else use the language base from workspace setting
	const workspaceDocumentBaseUri = programConfig.data?.workspace
		? ensureTrailingSlash(localPathToFileUri(programConfig.data.workspace))
		: "file:///algorimejo/"
	const languageServerDocumentUri = documentUri ?? new URL(
		`${encodeURIComponent(documentID)}.${getFileExtensionOfLanguage(languageItem.base)}`,
		workspaceDocumentBaseUri,
	).toString()
	const languageExtension = useLanguageExtension(
		languageItem,
		languageServerDocumentUri,
		documentUri !== undefined || programConfig.status === "success",
	)
	// if the language is not configured in workspace setting, show error toast
	useEffect(() => {
		if (workspaceConfig.status !== "success")
			return
		if (workspaceLangCfg[language] === null) {
			const message = `Language "${language}" is not configured in workspace setting, please check it in workspace setting. Fallback to Text.`
			log.error(message)
			// Only show toast once when error is first detected
			const toastKey = `lang-config-error-${language}`
			if (!toast.isActive(toastKey)) {
				toast.error(message, {
					toastId: toastKey,
				})
			}
		}
		else {
			log.trace(`load (${language})${workspaceLangCfg[language]?.base} for document ${documentID}`)
		}
	}, [workspaceConfig.status, language, documentID, workspaceLangCfg])

	if (languageExtension.error) {
		return <ErrorLabel message={languageExtension.error} location="initializing language extension" />
	}
	else if (workspaceConfig.status === "error") {
		return <ErrorLabel message={workspaceConfig.error} location="loading workspace config" />
	}
	else if (programConfig.status === "error") {
		return <ErrorLabel message={programConfig.error} location="loading program config" />
	}
	else if (languageExtension.status === "pending" || !isDocumentLoaded || workspaceConfig.status === "pending" || programConfig.status === "pending") {
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
		<CodeEditor
			className={className}
			documentID={documentID}
			language={languageItem.base}
			textarea={textarea}
			ydoc={ydoc}
			ytext={ytext}
			externalExtension={[
				languageExtension.data,
				configExtension(workspaceConfig.data, programConfig.data),
				basicSetup({
					lineNumbers: !textarea,
					foldGutter: !textarea,
					indentOnInput: !textarea,
				}),
			]}
		/>
	)
}

function CodeEditor({
	className,
	language = "Text",
	documentID,
	ytext,
	externalExtension,
}: CodeEditorProps & {
	ytext: Y.Text
	ydoc: Y.Doc
	externalExtension: Extension[]
}) {
	const containerRef = useRef<HTMLDivElement>(null)
	const viewRef = useRef<EditorView | null>(null)
	const stateRef = useRef<EditorState | null>(null)
	const undoManager = useMemo(() => new Y.UndoManager(ytext), [ytext])
	const externalExtensionCompartment = useMemo(() => new Compartment(), [])

	useEffect(() => {
		const state = EditorState.create({
			doc: ytext.toString(),
			extensions: [
				yCollab(ytext, null, {
					undoManager,
				}),
				keymap.of([indentWithTab]),
				externalExtensionCompartment.of(externalExtension),
			],
		})
		const view = new EditorView({
			state,
			parent: containerRef.current!,
		})
		viewRef.current = view
		stateRef.current = state
		return () => {
			view.destroy()
			viewRef.current = null
			stateRef.current = null
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [externalExtension])
	useEffect(() => {
		if (!viewRef.current)
			return
		viewRef.current.dispatch({
			effects: externalExtensionCompartment.reconfigure(externalExtension),
		})
		log.trace("dispatch reconfigure effects to codemirror editor")
	}, [externalExtension, externalExtensionCompartment])

	return (
		<div
			ref={containerRef}
			data-language-base={language}
			data-document={documentID}
			className={className}
		>
		</div>
	)
}
