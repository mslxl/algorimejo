interface ErrorLabelProps {
	message: string
}
export function ErrorLabel({ message }: ErrorLabelProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
			<h1 className="text-xl font-semibold text-destructive">Error</h1>
			<p className="text-sm text-muted-foreground">{message}</p>
		</div>
	)
}
