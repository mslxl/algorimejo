interface ErrorLabelProps {
	message: string | Error
}
export function ErrorLabel({ message }: ErrorLabelProps) {
	const errorMessage = typeof message === "string" ? message : message.message
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
			<h1 className="text-xl font-semibold text-destructive">Error</h1>
			<p className="text-sm text-muted-foreground">{errorMessage}</p>
		</div>
	)
}
