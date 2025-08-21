import type { HTMLAttributes } from "react"
import { motion } from "motion/react"
import { useReducer } from "react"
import { cn } from "@/lib/utils"

interface FunnyAboutProps extends HTMLAttributes<HTMLDivElement> {
}
export function FunnyAbout({ className, ...props }: FunnyAboutProps) {
	const [editorType, changeEditorType] = useReducer(
		(state: number) => state + 1,
		0,
	)
	return (
		<div className="bg-black px-2 py-1 select-none">
			<div className={cn("flex flex-col border-2 border-amber-200 overflow-hidden  bg-black p-2", className)} {...props}>
				<div className="mx-2 bg-amber-200 p-1 py-0 text-center">
					<span className="text-2xl font-bold text-black">纯天然手工代码</span>

					<div className="bg-blue-700 p-1 text-center">
						<span className="text-2xl font-medium text-white">从小敲到大</span>
						<div className="rounded-lg border border-amber-200 bg-red-600 px-8 py-2 text-center text-4xl">
							<span className="text-8xl font-semibold text-white">零AI</span>
						</div>
					</div>
					<div className="bg-blue-700 px-4 text-center">
						<div className="text-white">
							<div className="text-2xl font-bold">21年</div>
							<div className="text-2xl font-bold text-amber-200">纯正人类程序员</div>
						</div>
					</div>
					<div className="cursor-pointer border-4 border-red-600 bg-amber-200 px-2" onClick={() => changeEditorType()}>
						<div className="flex justify-center ">
							<span className="block text-2xl font-bold text-red-600">用 Vi</span>
							<motion.span
								initial={{ width: 0 }}
								animate={{ width: editorType >= 1 ? "auto" : 0 }}
								className="block truncate text-2xl font-bold text-red-600"
							>
								sual Studio Code
							</motion.span>
						</div>
						<motion.span
							initial={{ height: 0, opacity: 0 }}
							animate={{
								height: editorType >= 2 ? "auto" : 0,
								opacity: editorType >= 2 ? 1 : 0,
							}}
							className="block truncate text-2xl font-bold text-red-600"
						>
							with Neovim Plugin
						</motion.span>
					</div>
					<div className="bg-blue-600 p-2 text-center">
						<span className="text-8xl text-amber-200 text-shadow-[black_5px_0_0,black_0_5px_0,black_-5px_0_0,black_0_-5px_0]">手敲</span>
					</div>
				</div>
				<div className="rounded-lg border-2 border-amber-200 bg-red-600 text-center">
					<div className="text-white">
						<div className="text-5xl font-medium">敢承诺</div>
						<div className="flex items-center justify-center px-4 text-3xl font-medium ">
							<span>不添加任何</span>
							<div className="flex flex-col text-xs font-medium">
								<span>ChatGPT</span>
								<span>Copilot</span>
							</div>
							<span>代码</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
