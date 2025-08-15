import { useLayoutEffect } from "react"
import { match, P } from "ts-pattern"
import { useProgramConfig } from "@/hooks/use-program-config"
import { getShadcnTheme } from "./theme"
import zincTheme from "./zinc.css?raw"
import zincDarkTheme from "./zincDark.css?raw"

interface ThemeProviderProps {
	children: React.ReactNode
}
export function ThemeProvider({ children }: ThemeProviderProps) {
	const config = useProgramConfig()
	const themeName = config.data?.theme

	useLayoutEffect(() => {
		const styleElement = document.createElement("style")
		styleElement.innerHTML
			= match(themeName)
				.with(P.nullish, () => zincTheme)
				.with("default", () => zincTheme)
				.with("zinc", () => zincTheme)
				.with("zincDark", () => zincDarkTheme)
				.otherwise(name => getShadcnTheme(name))
		styleElement.setAttribute("data-theme", themeName ?? "default")
		styleElement.type = "text/css"
		document.head.appendChild(styleElement)
		return () => {
			document.head.removeChild(styleElement)
		}
	}, [themeName])
	return children
}
