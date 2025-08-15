import { lazy } from "react"

export const WorkspacePreference = lazy(() => import("./workspace-pref").then(mod => ({ default: mod.WorkspacePref })))
