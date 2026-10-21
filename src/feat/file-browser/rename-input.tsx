import { useEffect, useRef } from "react"

interface RenameInputProps {
	defaultValue: string
	/** Called with the trimmed name, only when it is non-empty and actually changed */
	onCommit: (newName: string) => void
	onDone: () => void
}

/**
 * Inline rename field: Enter or blur commits, Escape cancels
 */
export function RenameInput({ defaultValue, onCommit, onDone }: RenameInputProps) {
	const inputRef = useRef<HTMLInputElement>(null)
	const finishedRef = useRef(false)

	useEffect(() => {
		// The context menu restores focus to its trigger when it closes, so wait for that first
		const timer = setTimeout(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		}, 50)
		return () => clearTimeout(timer)
	}, [])

	function finish(commit: boolean) {
		if (finishedRef.current)
			return
		finishedRef.current = true
		const newName = inputRef.current?.value.trim() ?? ""
		if (commit && newName && newName !== defaultValue)
			onCommit(newName)
		onDone()
	}

	return (
		<input
			ref={inputRef}
			className="w-full rounded-sm border border-ring bg-background px-1 text-sm outline-none"
			autoComplete="off"
			spellCheck={false}
			type="text"
			name="name"
			aria-label="New name"
			defaultValue={defaultValue}
			onBlur={() => finish(true)}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault()
					finish(true)
				}
				else if (e.key === "Escape") {
					e.preventDefault()
					finish(false)
				}
			}}
		/>
	)
}
