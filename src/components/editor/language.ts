import type { AdvLanguageItem, LanguageBase } from "@/lib/client"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as log from "@tauri-apps/plugin-log"
import { useEffect, useMemo } from "react"
import { algorimejo } from "@/lib/algorimejo"

export type Language = LanguageBase | "Text"

export function useLanguageExtension(lang: AdvLanguageItem, documentUri: string, enabled = true) {
	const client = useQueryClient()
	const sessionKey = algorimejo.langClient.getSessionKey(lang, documentUri)
	const queryKey = useMemo(() => ["language-extension", sessionKey] as const, [sessionKey])
	const query = useQuery({
		queryKey,
		queryFn: () => algorimejo.langClient.getClient(lang, documentUri, () => {
			log.warn(`Language server for ${lang.base} terminated, invalidate its extension cache`)
			client.invalidateQueries({ queryKey })
		}),
		enabled,
		staleTime: Infinity,
		gcTime: 35_000,
		retry: 4,
		retryDelay: attempt => Math.min(500 * 2 ** attempt, 8_000),
	})

	useEffect(() => {
		if (!enabled || lang.lsp === null || lang.lsp_connect !== "StdIO") {
			return
		}

		algorimejo.langClient.retainSession(sessionKey)
		return () => {
			algorimejo.langClient.releaseSession(sessionKey, () => {
				client.removeQueries({ queryKey, exact: true })
			})
		}
	}, [client, enabled, lang.lsp, lang.lsp_connect, queryKey, sessionKey])

	return query
}
