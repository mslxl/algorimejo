import type { ForwardedRef } from "react"
import type { ProgramConfig, WorkspaceConfig } from "@/lib/client"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { basicSetup } from "@uiw/codemirror-extensions-basic-setup"
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import { useProgramConfig } from "@/hooks/use-program-config"
import { useWorkspaceConfig } from "@/hooks/use-workspace-config"
import { ErrorLabel } from "../error-label"
import { Skeleton } from "../ui/skeleton"
import { configExtension } from "./config-extension"

export interface CodeMirrorTextareaRef {
	view: EditorView | null
	state: EditorState | null
	container: HTMLDivElement | null
	clear: () => void
	append: (text: string) => void
	getValue: () => string
	setValue: (value: string) => void
}

interface CodeMirrorTextareaContentProps extends React.HTMLAttributes<HTMLDivElement> {
	defaultValue: string
	workspaceConfig: WorkspaceConfig
	programConfig: ProgramConfig
	editable?: boolean
}

const CodeMirrorTextareaContent = forwardRef<CodeMirrorTextareaRef, CodeMirrorTextareaContentProps>(
	({ defaultValue, workspaceConfig, programConfig, editable, ...props }: CodeMirrorTextareaContentProps, ref: ForwardedRef<CodeMirrorTextareaRef>) => {
		const containerRef = useRef<HTMLDivElement | null>(null)
		const viewRef = useRef<EditorView | null>(null)
		const stateRef = useRef<EditorState | null> (null)

		useImperativeHandle(ref, () => ({
			view: viewRef.current,
			state: stateRef.current,
			container: containerRef.current,
			clear: () => {
				if (stateRef.current) {
					stateRef.current.update({
						changes: { from: 0, to: stateRef.current.doc.length, insert: "" },
					})
				}
			},
			append: (text: string) => {
				if (stateRef.current) {
					stateRef.current.update({
						changes: { from: stateRef.current.doc.length, to: stateRef.current.doc.length, insert: text },
					})
				}
			},
			getValue: () => {
				if (stateRef.current) {
					return stateRef.current.doc.toString()
				}
				return ""
			},
			setValue: (value: string) => {
				if (stateRef.current) {
					stateRef.current.update({
						changes: { from: 0, to: stateRef.current.doc.length, insert: value },
					})
				}
			},
		}))

		useEffect(() => {
			const state = EditorState.create({
				doc: defaultValue,
				extensions: [
					basicSetup({
						lineNumbers: false,
						foldGutter: false,
						indentOnInput: false,
					}),
					EditorView.editable.of(editable ?? false),
					configExtension(workspaceConfig, programConfig),
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
		})
		return <div ref={containerRef} {...props} />
	},
)
interface CodeMirrorTextareaProps extends React.HTMLAttributes<HTMLDivElement> {
	defaultValue: string
	editable?: boolean
}

export const CodeMirrorTextarea = forwardRef<CodeMirrorTextareaRef, CodeMirrorTextareaProps>(
	({ defaultValue, editable, ...props }: CodeMirrorTextareaProps, ref: ForwardedRef<CodeMirrorTextareaRef>) => {
		const config = useWorkspaceConfig()
		const programConfig = useProgramConfig()
		if (config.status === "pending" || programConfig.status === "pending") {
			return (
				<div {...props}>
					<Skeleton className="h-[1em] w-full" />
				</div>
			)
		}
		else if (config.status === "error") {
			return <ErrorLabel message={config.error} location="loading workspace config" />
		}
		else if (programConfig.status === "error") {
			return <ErrorLabel message={programConfig.error} location="loading program config" />
		}
		return <CodeMirrorTextareaContent {...props} ref={ref} defaultValue={defaultValue} editable={editable} workspaceConfig={config.data} programConfig={programConfig.data} />
	},
)
