import type { AdvLanguageItem, LanguageBase } from "@/lib/client"

const supportedCheckerBases = new Set<LanguageBase>([
	"Cpp",
	"Python",
	"JavaScript",
	"TypeScript",
	"Go",
])

export function getCheckerLanguageNames(languages?: Map<string, AdvLanguageItem>) {
	return [...(languages?.entries() ?? [])]
		.filter(([, language]) => supportedCheckerBases.has(language.base))
		.map(([name]) => name)
		.sort((left, right) => left.localeCompare(right))
}
