import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "react-toastify"
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
		else if (options.enabled && options.language && availableLanguage.data) {
			toast.error(`language ${options.language} is not available`)
		}
	}, [options.language, options.enabled, availableLanguage.data])

	return useQuery({
		queryKey: WORKSPACE_CONFIG_QUERY_KEY.concat("languages", options.language ?? "none"),
		enabled: !!availableLanguage.data && options.enabled,
		queryFn: () => {
			return availableLanguage.data?.get(options.language!)
		},
	})
}
