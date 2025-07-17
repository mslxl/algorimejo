import { type HTMLAttributes, useEffect, useRef } from "react";
import "@/components/monaco/env";
import * as monaco from "monaco-editor";
import { toast } from "react-toastify";
import { cn } from "@/lib/utils";

interface MonacoEditor extends HTMLAttributes<HTMLDivElement> {}
export function MonacoEditor({ className, ...props }: MonacoEditor) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!ref.current) {
			toast.error("[Internal Error]: Monaco Container should not be null");
			return;
		}

		const editor = monaco.editor.create(ref.current, {
			value: "function hello() {\n\talert('hello world!');\n}",
			language: "javascript",
			automaticLayout: true,
		});

		return () => {
			editor.dispose();
		};
	}, []);

	return (
		<div
			className={cn(className, "monaco-container")}
			{...props}
			ref={ref}
		></div>
	);
}
