import type { AdvLanguageItem, ProgramSimpleOutput } from "./client"
import { MD5 } from "crypto-js"
import { commands, events } from "./client"
import { getFileExtensionOfLanguage } from "./client/type"
import { LRUCache } from "./lru-cache"

const cache = new LRUCache<string, ProgramSimpleOutput>(512)

export async function compileCode(tag: string, codeDocID: string, language: AdvLanguageItem, timeout: number = 3000) {
	const code = await commands.getStringOfDoc(codeDocID, "content")
	const hash = MD5(`${tag}(${language.base}, ${language.cmd_compile}):${code}`).toString()
	const cached_output = cache.get(hash)
	if (cached_output) {
		return cached_output
	}

	const source = await commands.writeFileToTaskTag(tag, `code.${getFileExtensionOfLanguage(language.base)}`, code)
	const res = await commands.executeProgram(tag, language.cmd_compile, {
		SRC: source,
	}, timeout)
	if (res.is_timeout) {
		throw new Error("Compile timeout")
	}
	cache.put(hash, res)
	return res
}

export type ExecuteProgramOutputListener = (line: string, type: "stdout" | "stderr") => void
export async function executeProgram(tag: string, inputFileDocID: string, language: AdvLanguageItem, timeout: number, outputListener?: ExecuteProgramOutputListener) {
	const inputContent = await commands.getStringOfDoc(inputFileDocID, "content")
	// TODO: Actually we can copy the content in rust, but I am lazy. Fix it later
	const inputFile = await commands.writeFileToTaskTag(tag, `case-${inputFileDocID}.txt`, inputContent)

	let unsub = Promise.resolve(() => {})

	try {
		unsub = events.programOutputEvent.listen((e) => {
			if (e.payload.task_tag !== tag)
				return
			if (e.payload.source === "Stdout") {
				outputListener?.(e.payload.line, "stdout")
			}
			else {
				outputListener?.(e.payload.line, "stderr")
			}
		})

		if (language.cmd_before_run) {
			commands.executeProgram(tag, language.cmd_before_run, {}, 3000)
		}
		const execuatedResult = await commands.executeProgramCallback(tag, language.cmd_run, {}, inputFile, timeout)
		if (language.cmd_after_run) {
			commands.executeProgram(tag, language.cmd_after_run, {}, 3000)
		}

		return execuatedResult
	}
	finally {
		unsub.then(unsub => unsub())
	}
}

export async function checkOutput(tag: string, inputDocID: string, outputFile: string, answerDocID: string, checkerName: string) {
	const inputContent = await commands.getStringOfDoc(inputDocID, "content")
	const answerContent = await commands.getStringOfDoc(answerDocID, "content")
	const inputFile = await commands.writeFileToTaskTag(tag, `case-${inputDocID}.in`, inputContent)
	const answerFile = await commands.writeFileToTaskTag(tag, `case-${answerDocID}.ans`, answerContent)

	const checker = await commands.resolveChecker(checkerName)
	const res = await commands.executeProgram(tag, `${checker} %INPUT %OUTPUT %ANSWER`, {
		INPUT: inputFile,
		ANSWER: answerFile,
		OUTPUT: outputFile,
	}, 12000)
	return res
}

interface RunTestcaseParams {
	tag: string
	testcaseInputDocID: string
	testcaseOutputDocID: string
	solutionDocID: string
	checkerName: string
	language: AdvLanguageItem
	compileTimeout: number
	runTimeout: number
	programOutputListener?: (line: string, type: "stdout" | "stderr") => void
}

export type RunTestResultStatus = RunTestResult["result"] | "PD" | "UNRUN"
type RunTestResult = {
	result: "CE"
	compilerOutput: string
	compilerErrorOutput: string
	compilerExitCode: number
} | {
	// What's up? you make a compile-time generated table? that is not funny
	result: "CETLE"
} | {
	result: "AC"
	stdout: string
	stdoutFile: string
	checkerMsg: string
	stripped: boolean
} | {
	// Umm, this program error
	// Report to developer maybe?
	result: "UKE"
	error: string
} | {
	result: "TLE"
	stdout: string
	stdoutFile: string
	stripped: boolean
} | {
	result: "WA" // checker exit with 1
	stdout: string
	stdoutFile: string
	checkerMsg: string
	stripped: boolean
} | {
	// ?
	result: "CHKTLE"
	stdout: string
	stdoutFile: string
	checkerMsg: string
	stripped: boolean
} | {
	result: "RE"
	stdout: string
	stdoutFile: string
	stripped: boolean
} | {
	result: "PE" // checker exit with 2
	stdout: string
	stdoutFile: string
	checkerMsg: string
	stripped: boolean
} | {
	result: "CHKRE"
	stdout: string
	stdoutFile: string
	checkerMsg: string
	stripped: boolean
}

export async function runTestcase({
	tag,
	testcaseInputDocID,
	testcaseOutputDocID,
	solutionDocID,
	checkerName,
	language,
	compileTimeout,
	runTimeout,
	programOutputListener,
}: RunTestcaseParams): Promise<RunTestResult> {
	try {
		const compileInfo = await compileCode(tag, solutionDocID, language, compileTimeout)
		if (compileInfo.is_timeout) {
			return {
				result: "CETLE",
			}
		}
		else if (compileInfo.exit_code !== 0) {
			return {
				result: "CE",
				compilerOutput: compileInfo.stdout,
				compilerErrorOutput: compileInfo.stderr,
				compilerExitCode: compileInfo.exit_code,
			}
		}
		const runInfo = await executeProgram(tag, testcaseInputDocID, language, runTimeout, programOutputListener)
		if (runInfo.is_timeout) {
			return {
				result: "TLE",
				stdout: runInfo.content,
				stripped: runInfo.type === "Strip",
				stdoutFile: runInfo.output_file,
			}
		}
		else if (runInfo.exit_code !== 0) {
			return {
				result: "RE",
				stdout: runInfo.content,
				stripped: runInfo.type === "Strip",
				stdoutFile: runInfo.output_file,
			}
		}
		const checkInfo = await checkOutput(tag, testcaseInputDocID, runInfo.output_file, testcaseOutputDocID, checkerName)
		if (checkInfo.is_timeout) {
			return {
				result: "CHKTLE",
				stdout: runInfo.content,
				stripped: runInfo.type === "Strip",
				stdoutFile: runInfo.output_file,
				checkerMsg: checkInfo.stderr,
			}
		}
		else if (checkInfo.exit_code === 1) {
			return {
				result: "WA",
				stdout: runInfo.content,
				stripped: runInfo.type === "Strip",
				stdoutFile: runInfo.output_file,
				checkerMsg: checkInfo.stderr,
			}
		}
		else if (checkInfo.exit_code === 2) {
			return {
				result: "PE",
				stdout: runInfo.content,
				stripped: runInfo.type === "Strip",
				stdoutFile: runInfo.output_file,
				checkerMsg: checkInfo.stderr,
			}
		}
		else if (checkInfo.exit_code === 0) {
			return {
				result: "AC",
				stdout: runInfo.content,
				stripped: runInfo.type === "Strip",
				stdoutFile: runInfo.output_file,
				checkerMsg: checkInfo.stderr,
			}
		}
		else {
			// TODO: what is this?
			/*
             *  Outcomes 6-15 are reserved for future use.
                enum TResult {
                    _ok = 0,
                    _wa = 1,
                    _pe = 2,
                    _fail = 3,
                    _dirt = 4,
                    _points = 5,
                    _unexpected_eof = 8,
                    _partially = 16
                };
            */
			return {
				result: "CHKRE",
				stdout: runInfo.content,
				stripped: runInfo.type === "Strip",
				stdoutFile: runInfo.output_file,
				checkerMsg: checkInfo.stderr,
			}
		}
	}
	catch (e) {
		return {
			result: "UKE",
			error: e instanceof Error ? e.message : (e as string),
		}
	}
}

export const runTestStatusToColor: Record<RunTestResultStatus, `#${string}`> = {
	PD: "#3B82F6", // 蓝色 - 等待中
	UNRUN: "#6B7280", // 灰色 - 未运行
	CE: "#DC2626", // 深红色 - 编译错误
	CETLE: "#EA580C", // 深橙色 - 编译超时
	AC: "#16A34A", // 绿色 - 通过
	WA: "#DC2626", // 红色 - 答案错误
	PE: "#EAB308", // 黄色 - 格式错误
	TLE: "#F97316", // 橙色 - 超时
	RE: "#9333EA", // 紫色 - 运行时错误
	CHKTLE: "#F97316", // 橙色 - 检查器超时
	CHKRE: "#9333EA", // 紫色 - 检查器运行时错误
	UKE: "#374151", // 深灰色 - 未知错误
}
