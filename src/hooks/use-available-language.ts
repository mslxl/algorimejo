import type { AdvLanguageItem } from "@/lib/client"
import { useQuery } from "@tanstack/react-query"
import { useWorkspaceConfig, WORKSPACE_CONFIG_QUERY_KEY } from "./use-workspace-config"

export function useAvailableLanguage() {
	const workspaceConfig = useWorkspaceConfig()
	return useQuery({
		queryKey: WORKSPACE_CONFIG_QUERY_KEY.concat("languages"),
		enabled: !!workspaceConfig.data,
		queryFn: () => {
			const langs = new Map<string, AdvLanguageItem>()
			if (workspaceConfig.data) {
				for (const item in workspaceConfig.data.language) {
					langs.set(item, workspaceConfig.data.language[item]!)
				}
			}
			return langs
		},
	})
}
