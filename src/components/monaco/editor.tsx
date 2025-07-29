import { type HTMLAttributes, useEffect, useRef } from "react";
import "@/components/monaco/env";
import * as monaco from "monaco-editor";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

interface MonacoEditor extends HTMLAttributes<HTMLDivElement> {
	documentID: string;
}
export function MonacoEditor({
	className,
	documentID,
	...props
}: MonacoEditor) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!ref.current) {
			toast.error("[Internal Error]: Monaco Container should not be null");
			return;
		}

		const editor = monaco.editor.create(ref.current, {
			value: `// Document ID: ${documentID}\nfunction hello() {\n\talert('hello world!');\n}`,
			language: "javascript",
			automaticLayout: true,
		});

		return () => {
			editor.dispose();
		};
	}, [documentID]);

	return (
		<div
			className={cn(className, "monaco-container")}
			{...props}
			ref={ref}
		></div>
	);
}
