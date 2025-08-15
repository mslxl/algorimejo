import type { LanguageBase, LanguageServerProtocolConnectionType } from "./local"
import { identity } from "lodash"
import { sortBy } from "lodash/fp"

export const LanguageBaseValues: LanguageBase[] = sortBy(identity, ["Cpp", "TypeScript", "Python", "JavaScript", "Go", "Text"])
export const LanguageServerProtocolConnectionTypeValues: LanguageServerProtocolConnectionType[] = ["StdIO", "WebSocket"]
