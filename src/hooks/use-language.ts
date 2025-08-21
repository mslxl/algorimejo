import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { useAvailableLanguage } from "./use-available-language"
import { WORKSPACE_CONFIG_QUERY_KEY } from "./use-workspace-config"

interface UseLanguageOptions {
	language?: string
	enabled?: boolean
}
export function useLanguage(options: UseLanguageOptions) {
	const availableLanguage = useAvailableLanguage()

	useEffect(() => {
		if (options.enabled && !options.language) {
			throw new Error("language is required when enabled is true")
		}
	}, [options.language, options.enabled])

	return useQuery({
		queryKey: WORKSPACE_CONFIG_QUERY_KEY.concat("languages", options.language ?? "none"),
		enabled: !!availableLanguage.data && options.enabled,
		queryFn: () => {
			return availableLanguage.data?.get(options.language!)
		},
	})
}
