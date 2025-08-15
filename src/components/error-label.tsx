interface ErrorLabelProps {
	message: string | Error
	location?: string
}
export function ErrorLabel({ message, location }: ErrorLabelProps) {
	const errorMessage = typeof message === "string" ? message : message.message
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
			<h1 className="text-xl font-semibold text-destructive">Error</h1>
			<p className="text-sm text-muted-foreground">{errorMessage}</p>
			{
				location && (
					<p className="pl-4 text-sm text-muted-foreground">
						when
						{" "}
						{location}
					</p>
				)
			}
		</div>
	)
}
