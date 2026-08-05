import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import { Eraser, Square, SquareTerminal, X } from "lucide-react"
import { useEffect, useRef, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { algorimejo } from "@/lib/algorimejo"
import { embeddedTerminal } from "@/lib/embedded-terminal"
import { cn } from "@/lib/utils"
import "@xterm/xterm/css/xterm.css"
import "./terminal.css"

const ESCAPE = 27
const CSI_BRACKET = 91
const CSI_FINAL_START = 64
const CSI_FINAL_END = 126
const SGR_FINAL = 109
const STDERR_RED = new Uint8Array([ESCAPE, CSI_BRACKET, 57, 49, SGR_FINAL])
const RESET_STYLE = new Uint8Array([ESCAPE, CSI_BRACKET, 48, SGR_FINAL])

class StderrColorizer {
	private pendingEscape: number[] = []

	reset() {
		this.pendingEscape = []
	}

	colorize(data: Uint8Array) {
		const output: number[] = []
		for (const byte of data) {
			if (this.pendingEscape.length === 0) {
				if (byte === ESCAPE)
					this.pendingEscape.push(byte)
				else
					output.push(byte)
				continue
			}

			this.pendingEscape.push(byte)
			if (this.pendingEscape.length === 2 && byte !== CSI_BRACKET) {
				output.push(...this.pendingEscape)
				this.pendingEscape = []
				continue
			}

			if (this.pendingEscape.length > 2 && byte >= CSI_FINAL_START && byte <= CSI_FINAL_END) {
				// Drop SGR sequences so stderr cannot override the enforced red foreground.
				if (byte !== SGR_FINAL)
					output.push(...this.pendingEscape)
				this.pendingEscape = []
			}
		}

		if (output.length === 0)
			return null

		const colored = new Uint8Array(STDERR_RED.length + output.length + RESET_STYLE.length)
		colored.set(STDERR_RED)
		colored.set(output, STDERR_RED.length)
		colored.set(RESET_STYLE, STDERR_RED.length + output.length)
		return colored
	}
}

function TerminalAction({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button type="button" variant="ghost" size="icon" className="size-7" {...props}>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top">{label}</TooltipContent>
		</Tooltip>
	)
}

export function EmbeddedTerminalButton({ isSelected, onClick }: { isSelected: boolean, onClick?: () => void }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn("flex size-6 items-center justify-center hover:bg-secondary", {
						"bg-secondary": isSelected,
					})}
					onClick={onClick}
				>
					<SquareTerminal className="size-4" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top">Terminal</TooltipContent>
		</Tooltip>
	)
}

export function EmbeddedTerminalPanel() {
	const hostRef = useRef<HTMLDivElement>(null)
	const snapshot = useSyncExternalStore(embeddedTerminal.subscribe, embeddedTerminal.getSnapshot)

	useEffect(() => {
		const host = hostRef.current
		if (!host)
			return

		const styles = getComputedStyle(host)
		const terminal = new Terminal({
			cursorBlink: true,
			fontFamily: "\"JetBrains Mono\", Consolas, \"Courier New\", monospace",
			fontSize: 13,
			scrollback: 5000,
			allowTransparency: true,
			theme: {
				background: styles.backgroundColor,
				foreground: styles.color,
				cursor: styles.color,
			},
		})
		const fitAddon = new FitAddon()
		const stderrColorizer = new StderrColorizer()
		terminal.loadAddon(fitAddon)
		terminal.open(host)
		embeddedTerminal.getBufferedOutput().forEach(({ data, source }) => {
			const rendered = source === "stderr" ? stderrColorizer.colorize(data) : data
			if (rendered)
				terminal.write(rendered)
		})

		const outputDisposable = embeddedTerminal.subscribeOutput((event) => {
			if (event.type === "clear") {
				terminal.clear()
				stderrColorizer.reset()
			}
			else {
				const rendered = event.source === "stderr" ? stderrColorizer.colorize(event.data) : event.data
				if (rendered)
					terminal.write(rendered)
			}
		})
		const inputDisposable = terminal.onData(data => embeddedTerminal.write(data))
		const resizeDisposable = terminal.onResize(({ cols, rows }) => embeddedTerminal.resize(cols, rows))
		const resizeObserver = new ResizeObserver(() => {
			requestAnimationFrame(() => {
				try {
					fitAddon.fit()
				}
				catch {
					// The panel may have been collapsed before the animation frame runs.
				}
			})
		})
		resizeObserver.observe(host)
		fitAddon.fit()
		terminal.focus()

		return () => {
			resizeObserver.disconnect()
			outputDisposable()
			inputDisposable.dispose()
			resizeDisposable.dispose()
			terminal.dispose()
		}
	}, [])

	const isRunning = ["starting", "running", "stopping"].includes(snapshot.status)
	const statusLabel = snapshot.status === "exited" && snapshot.exitCode !== null
		? `Exited (${snapshot.exitCode})`
		: snapshot.status.charAt(0).toUpperCase() + snapshot.status.slice(1)

	return (
		<div className="flex size-full min-h-0 flex-col bg-background text-foreground">
			<div className="flex h-8 shrink-0 items-center gap-2 border-b px-2">
				<SquareTerminal className="size-4" />
				<span className="text-xs font-medium">Terminal</span>
				<span className="text-xs text-muted-foreground">{statusLabel}</span>
				<span className="flex-1" />
				<TerminalAction label="Clear terminal" onClick={() => embeddedTerminal.clear()}>
					<Eraser />
				</TerminalAction>
				<TerminalAction label="Stop process" disabled={!isRunning} onClick={() => embeddedTerminal.kill()}>
					<Square />
				</TerminalAction>
				<TerminalAction label="Close terminal" onClick={() => algorimejo.dock.select("bottom", null)}>
					<X />
				</TerminalAction>
			</div>
			<div ref={hostRef} className="embedded-terminal-host min-h-0 flex-1 overflow-hidden bg-background text-foreground" />
		</div>
	)
}
