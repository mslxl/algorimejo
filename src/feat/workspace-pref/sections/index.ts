import { lazy } from "react"

export const EditorSection = lazy(() => import("./editor").then(m => ({ default: m.WorkspaceEditorSection })))
export const CompilerSection = lazy(() => import("./compiler").then(m => ({ default: m.CompilerSection })))
