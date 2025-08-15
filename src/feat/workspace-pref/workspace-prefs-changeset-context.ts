import type { Draft } from "immer"
import type { WorkspaceConfig } from "@/lib/client"
import { createContext, useContext } from "react"

export const WorkspacePrefsChangesetContext = createContext<WorkspaceConfig | null>(null)
export const WorkspacePrefsChangesetSetterContext = createContext<((setter: (draft: Draft<WorkspaceConfig>) => void, applyInstant?: boolean) => void) | null>(null)
export const WorkspacePrefsChangesetApplyContext = createContext<(() => Promise<void>) | null>(null)

export function useWorkspacePrefsChangeset() {
	return useContext(WorkspacePrefsChangesetContext)
}

export function useWorkspacePrefsChangesetSetter() {
	return useContext(WorkspacePrefsChangesetSetterContext)
}

export function useWorkspacePrefsChangesetApply() {
	return useContext(WorkspacePrefsChangesetApplyContext)
}
