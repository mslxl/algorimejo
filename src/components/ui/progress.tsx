import { cn } from "@/lib/utils"

interface ProgressProps extends Omit<React.ComponentProps<"div">, "children"> {
	label: string
	value: number | null
}

function Progress({ className, label, value, ...props }: ProgressProps) {
	const normalized = value === null ? null : Math.min(Math.max(value, 0), 100)

	return (
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={normalized ?? undefined}
			data-slot="progress"
			className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
			{...props}
		>
			<div
				className={cn(
					"h-full bg-primary transition-[width] duration-150",
					normalized === null && "w-full animate-pulse opacity-60",
				)}
				style={normalized === null ? undefined : { width: `${normalized}%` }}
			/>
		</div>
	)
}

export { Progress }
