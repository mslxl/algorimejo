import { lazy } from "react"

export const ProgramPreference = lazy(() => import("./program-pref").then(mod => ({ default: mod.ProgramPref })))
