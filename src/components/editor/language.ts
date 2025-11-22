import type { AdvLanguageItem, LanguageBase } from "@/lib/client"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as log from "@tauri-apps/plugin-log"
import { algorimejo } from "@/lib/algorimejo"

export type Language = LanguageBase | "Text"

export function useLanguageExtension(lang: AdvLanguageItem, documentUri: string) {
	const client = useQueryClient()
	return useQuery({
		queryKey: ["language-extension", lang, documentUri],
		queryFn: () => algorimejo.langClient.getClient(lang, documentUri, () => {
			log.warn(`Language server for ${lang.base} terminated, invalidate its extension cache`)
			client.invalidateQueries({ queryKey: ["language-extension", lang, documentUri] })
		}),
		staleTime: Infinity,
		gcTime: Infinity,
		retry: false,
		refetchInterval: Infinity,
	})
}
