import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import antfu from "@antfu/eslint-config"
import tailwind from "eslint-plugin-tailwindcss"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default antfu({
	react: true,
	typescript: true,
	stylistic: {
		indent: "tab",
		quotes: "double",
	},
	ignores: [
		"./src/lib/client/local.ts",
		"./src/components/ui/**/*.tsx",
		"**/*.gen.ts",
	],
}, {
	settings: {
		tailwindcss: {
			config: `${__dirname}/src/index.css`,
		},
	},
}, ...tailwind.configs["flat/recommended"])
