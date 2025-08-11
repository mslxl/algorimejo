// Determine if a color is dark based on its lightness
export function isColorDark(color: string): boolean {
	if (!color)
		return false

	// Handle hex colors
	if (color.startsWith("#")) {
		const r = Number.parseInt(color.slice(1, 3), 16)
		const g = Number.parseInt(color.slice(3, 5), 16)
		const b = Number.parseInt(color.slice(5, 7), 16)

		// Calculate relative luminance using sRGB coefficients
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
		return luminance < 0.5
	}

	// Handle oklch colors
	if (color.startsWith("oklch(")) {
		const match = color.match(/oklch\(([^)]+)\)/)
		if (match) {
			const values = match[1].split(" ").map(v => Number.parseFloat(v))
			if (values.length >= 1) {
				// First value is lightness in oklch
				return values[0] < 0.5
			}
		}
	}

	// Handle rgb/rgba colors
	if (color.startsWith("rgb")) {
		const match = color.match(/rgba?\(([^)]+)\)/)
		if (match) {
			const values = match[1].split(",").map(v => Number.parseFloat(v.trim()))
			if (values.length >= 3) {
				const [r, g, b] = values
				const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
				return luminance < 0.5
			}
		}
	}

	// Default to light if we can't parse the color
	return false
}

export function deepenColor(color: string, range: number = 1.1): string {
	if (!color)
		return color

	// Handle hex colors
	if (color.startsWith("#")) {
		const r = Number.parseInt(color.slice(1, 3), 16)
		const g = Number.parseInt(color.slice(3, 5), 16)
		const b = Number.parseInt(color.slice(5, 7), 16)

		// Darken by reducing RGB values
		const newR = Math.max(0, Math.floor(r / range))
		const newG = Math.max(0, Math.floor(g / range))
		const newB = Math.max(0, Math.floor(b / range))

		return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`
	}

	// Handle oklch colors
	if (color.startsWith("oklch(")) {
		const match = color.match(/oklch\(([^)]+)\)/)
		if (match) {
			const values = match[1].split(" ").map(v => Number.parseFloat(v))
			if (values.length >= 1) {
				// Reduce lightness (first value) by the range
				const newLightness = Math.max(0, values[0] / range)
				const newValues = [newLightness, ...values.slice(1)]
				return `oklch(${newValues.join(" ")})`
			}
		}
	}

	// Handle rgb/rgba colors
	if (color.startsWith("rgb")) {
		const match = color.match(/rgba?\(([^)]+)\)/)
		if (match) {
			const values = match[1].split(",").map(v => Number.parseFloat(v.trim()))
			if (values.length >= 3) {
				const [r, g, b] = values
				// Darken by reducing RGB values
				const newR = Math.max(0, Math.floor(r / range))
				const newG = Math.max(0, Math.floor(g / range))
				const newB = Math.max(0, Math.floor(b / range))

				if (values.length === 4) {
					// rgba
					return `rgba(${newR}, ${newG}, ${newB}, ${values[3]})`
				}
				else {
					// rgb
					return `rgb(${newR}, ${newG}, ${newB})`
				}
			}
		}
	}

	// Return original color if we can't parse it
	return color
}
