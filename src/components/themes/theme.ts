import * as log from "@tauri-apps/plugin-log"
import * as themes from "@uiw/codemirror-themes-all"
import { lowerFirst, startCase, upperFirst } from "lodash/fp"
import { deepenColor, isColorDark } from "@/lib/color"

export function getAvailableThemes() {
	const prefix = "defaultSettings"
	const names = Object.keys(themes)
		.filter(it => it.startsWith(prefix))
		.map(it => it.substring(prefix.length))
		.concat("zinc", "zincDark")

	return names.map(name => ({
		value: lowerFirst(name),
		label: startCase(name),
	}))
}

export function getCodemirrorThemeExtension(name?: string) {
	log.trace(`getCodemirrorThemeExtension: ${name}`)
	if (!name)
		return []
	if (name === "zincDark")
		return themes.vscodeDark
	const extension = (themes as any)[name] as typeof themes.vscodeDark
	if (!extension)
		return []
	return extension
}

export interface StyleSettings {
	/** Editor background color. */
	background?: string
	/** Editor background image. */
	backgroundImage?: string
	/** Default text color. */
	foreground?: string
	/** Caret color. */
	caret?: string
	/** Selection background. */
	selection?: string
	/** Selection match background. */
	selectionMatch?: string
	/** Background of highlighted lines. */
	lineHighlight?: string
	/** Gutter background. */
	gutterBackground?: string
	/** Text color inside gutter. */
	gutterForeground?: string
	/** Text active color inside gutter. */
	gutterActiveForeground?: string
	/** Gutter right border color. */
	gutterBorder?: string
}

export function getShadcnTheme(name: string): string {
	const normalizedName = upperFirst(name)
	const styles: StyleSettings = (themes as any)[`defaultSettings${normalizedName}`] ? (themes as any)[`defaultSettings${normalizedName}`] : themes.defaultSettingsVscodeLight

	// Define fallback values based on dark mode
	const fallbacks = {
		light: {
			background: "oklch(1 0 0)",
			foreground: "oklch(0.145 0 0)",
			card: "oklch(1 0 0)",
			cardForeground: "oklch(0.145 0 0)",
			popover: "oklch(1 0 0)",
			popoverForeground: "oklch(0.145 0 0)",
			primary: "oklch(0.205 0 0)",
			primaryForeground: "oklch(0.985 0 0)",
			secondary: "oklch(0.97 0 0)",
			secondaryForeground: "oklch(0.205 0 0)",
			muted: "oklch(0.97 0 0)",
			mutedForeground: "oklch(0.556 0 0)",
			accent: "oklch(0.97 0 0)",
			accentForeground: "oklch(0.205 0 0)",
			destructive: "oklch(0.577 0.245 27.325)",
			border: "oklch(0.922 0 0)",
			input: "oklch(0.922 0 0)",
			ring: "oklch(0.708 0 0)",
			sidebar: "oklch(0.985 0 0)",
			sidebarForeground: "oklch(0.145 0 0)",
			sidebarPrimary: "oklch(0.205 0 0)",
			sidebarPrimaryForeground: "oklch(0.985 0 0)",
			sidebarAccent: "oklch(0.97 0 0)",
			sidebarAccentForeground: "oklch(0.205 0 0)",
			sidebarBorder: "oklch(0.922 0 0)",
			sidebarRing: "oklch(0.708 0 0)",
		},
		dark: {
			background: "oklch(0.145 0 0)",
			foreground: "oklch(0.985 0 0)",
			card: "oklch(0.205 0 0)",
			cardForeground: "oklch(0.985 0 0)",
			popover: "oklch(0.205 0 0)",
			popoverForeground: "oklch(0.985 0 0)",
			primary: "oklch(0.922 0 0)",
			primaryForeground: "oklch(0.205 0 0)",
			secondary: "oklch(0.269 0 0)",
			secondaryForeground: "oklch(0.985 0 0)",
			muted: "oklch(0.269 0 0)",
			mutedForeground: "oklch(0.708 0 0)",
			accent: "oklch(0.269 0 0)",
			accentForeground: "oklch(0.985 0 0)",
			destructive: "oklch(0.704 0.191 22.216)",
			border: "oklch(1 0 0 / 10%)",
			input: "oklch(1 0 0 / 15%)",
			ring: "oklch(0.556 0 0)",
			sidebar: "oklch(0.205 0 0)",
			sidebarForeground: "oklch(0.985 0 0)",
			sidebarPrimary: "oklch(0.488 0.243 264.376)",
			sidebarPrimaryForeground: "oklch(0.985 0 0)",
			sidebarAccent: "oklch(0.269 0 0)",
			sidebarAccentForeground: "oklch(0.985 0 0)",
			sidebarBorder: "oklch(1 0 0 / 10%)",
			sidebarRing: "oklch(0.556 0 0)",
		},
	}
	const isDark = styles.background ? isColorDark(styles.background) : false

	const theme = isDark ? fallbacks.dark : fallbacks.light

	// Generate CSS variables based on the theme settings
	const cssVars = [
		"--radius: 0.625rem",
		`--background: ${styles.background && styles.background !== "transparent" ? deepenColor(styles.background, isDark ? 1.2 : 0.9) : theme.background}`,
		// `--foreground: ${styles.foreground ? hexToOklch(styles.foreground) : theme.foreground}`,
		`--foreground: ${theme.foreground}`,
		`--card: ${styles.background && styles.background !== "transparent" ? styles.background : theme.card}`,
		// `--card-foreground: ${styles.foreground ? hexToOklch(styles.foreground) : theme.cardForeground}`,
		`--card-foreground: ${theme.cardForeground}`,
		`--popover: ${styles.background && styles.background !== "transparent" ? styles.background : theme.popover}`,
		// `--popover-foreground: ${styles.foreground ? hexToOklch(styles.foreground) : theme.popoverForeground}`,
		`--popover-foreground: ${theme.popoverForeground}`,
		`--primary: ${styles.caret && styles.caret !== "transparent" ? styles.caret : theme.primary}`,
		// `--primary-foreground: ${styles.background ? hexToOklch(styles.background) : theme.primaryForeground}`,
		`--primary-foreground: ${theme.primaryForeground}`,
		`--secondary: ${styles.lineHighlight ? styles.lineHighlight : theme.secondary}`,
		// `--secondary-foreground: ${styles.foreground ? hexToOklch(styles.foreground) : theme.secondaryForeground}`,
		`--secondary-foreground: ${theme.secondaryForeground}`,
		`--muted: ${styles.gutterBackground ? styles.gutterBackground : theme.muted}`,
		// `--muted-foreground: ${styles.gutterForeground ? hexToOklch(styles.gutterForeground) : theme.mutedForeground}`,
		`--muted-foreground: ${theme.mutedForeground}`,
		`--accent: ${styles.selection ? styles.selection : theme.accent}`,
		// `--accent-foreground: ${styles.foreground ? hexToOklch(styles.foreground) : theme.accentForeground}`,
		`--accent-foreground: ${theme.accentForeground}`,
		`--destructive: ${theme.destructive}`,
		`--border: ${styles.gutterBorder && styles.gutterBorder !== "transparent" ? styles.gutterBorder : theme.border}`,
		`--input: ${styles.gutterBorder && styles.gutterBorder !== "transparent" ? styles.gutterBorder : theme.input}`,
		`--ring: ${styles.caret ? styles.caret : theme.ring}`,
		`--sidebar: ${styles.gutterBackground ? styles.gutterBackground : theme.sidebar}`,
		// `--sidebar-foreground: ${styles.gutterForeground ? hexToOklch(styles.gutterForeground) : theme.sidebarForeground}`,
		`--sidebar-foreground: ${theme.sidebarForeground}`,
		`--sidebar-primary: ${styles.caret && styles.caret !== "transparent" ? styles.caret : theme.sidebarPrimary}`,
		// `--sidebar-primary-foreground: ${styles.background ? hexToOklch(styles.background) : theme.sidebarPrimaryForeground}`,
		`--sidebar-primary-foreground: ${theme.sidebarPrimaryForeground}`,
		`--sidebar-accent: ${styles.selection ? styles.selection : theme.sidebarAccent}`,
		// `--sidebar-accent-foreground: ${styles.foreground ? hexToOklch(styles.foreground) : theme.sidebarAccentForeground}`,
		`--sidebar-accent-foreground: ${theme.sidebarAccentForeground}`,
		`--sidebar-border: ${styles.gutterBorder ? styles.gutterBorder : theme.sidebarBorder}`,
		`--sidebar-ring: ${styles.caret && styles.caret !== "transparent" ? styles.caret : theme.sidebarRing}`,
	]

	return `:root {\n  ${cssVars.join(";\n  ")};\n}`
}
