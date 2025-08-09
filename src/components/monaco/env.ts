import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"

import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"
import { match } from "ts-pattern"
import "monaco-editor"

// eslint-disable-next-line no-restricted-globals
self.MonacoEnvironment = {
	getWorker: (_, label) => {
		return match(label)
			.with("json", () => new JsonWorker())
			.with("typescript", "javascript", () => new TsWorker())
			.otherwise(() => new EditorWorker())
	},
}
