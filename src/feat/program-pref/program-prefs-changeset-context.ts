import type { Draft } from "immer"
import type { ProgramConfig } from "@/lib/client"
import { createContext, useContext } from "react"

export const ProgramPrefsChangesetContext = createContext<ProgramConfig | null>(null)
export const ProgramPrefsChangesetSetterContext = createContext<((setter: (draft: Draft<ProgramConfig>) => void, applyInstant?: boolean) => void) | null>(null)
export const ProgramPrefsChangesetApplyContext = createContext<(() => Promise<void>) | null>(null)

export function useProgramPrefsChangeset() {
	return useContext(ProgramPrefsChangesetContext)
}

export function useProgramPrefsChangesetSetter() {
	return useContext(ProgramPrefsChangesetSetterContext)
}

export function useProgramPrefsChangesetApply() {
	return useContext(ProgramPrefsChangesetApplyContext)
}
