import type { Draft } from "immer"
import type { DatabaseConfig } from "@/lib/client"
import { createContext, useContext } from "react"

export const PrefsChangesetContext = createContext<DatabaseConfig | null>(null)
export const PrefsChangesetSetterContext = createContext<((setter: (draft: Draft<DatabaseConfig>) => void) => void) | null>(null)
export const PrefsChangesetApplyContext = createContext<(() => Promise<void>) | null>(null)

export function useWorkspacePrefsChangeset() {
	return useContext(PrefsChangesetContext)
}

export function useWorkspacePrefsChangesetSetter() {
	return useContext(PrefsChangesetSetterContext)
}

export function useWorkspacePrefsChangesetApply() {
	return useContext(PrefsChangesetApplyContext)
}
