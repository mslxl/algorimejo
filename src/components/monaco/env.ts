import "monaco-editor";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { match } from "ts-pattern";

self.MonacoEnvironment = {
	getWorker: (_, label) => {
		return match(label)
			.with("json", () => new jsonWorker())
			.with("typescript", "javascript", () => new tsWorker())
			.otherwise(() => new editorWorker());
	},
};
