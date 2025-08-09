import type { HTMLAttributes } from "react"
import {
	forwardRef,

	useEffect,
	useRef,
	useState,
} from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface ProblemListSkeletonItemProps extends HTMLAttributes<HTMLDivElement> {}
export const ProblemListSkeletonItem = forwardRef<
	HTMLDivElement,
	ProblemListSkeletonItemProps
>(({ className, ...props }, ref) => (
	<div className={cn(className, "space-y-0.5")} ref={ref} {...props}>
		<Skeleton className="h-4 w-full rounded-full" />
		<div className="w-full pl-8">
			<Skeleton className="h-4 w-full rounded-full" />
		</div>
	</div>
))

interface ProblemListSkeletonProps extends HTMLAttributes<HTMLDivElement> {
	shrinkRatio?: number
}

export function ProblemListSkeleton({
	className,
	shrinkRatio = 2,
	...props
}: ProblemListSkeletonProps) {
	const skeletonRef = useRef<HTMLDivElement>(null)
	const skeletonItemRef = useRef<HTMLDivElement>(null)

	const [itemsNum, setItemsNum] = useState(0)
	useEffect(() => {
		if (!skeletonRef.current || !skeletonItemRef.current)
			return () => {}
		const parent = skeletonRef.current
		const element = skeletonItemRef.current
		const observer = new ResizeObserver(() => {
			const nums = Math.floor(
				parent.clientHeight / shrinkRatio / element.clientHeight,
			)
			setItemsNum(Math.max(nums - 2, 0))
		})

		observer.observe(skeletonRef.current)
		return () => {
			observer.disconnect()
		}
	}, [shrinkRatio])

	return (
		<div
			className={cn(className, "p-2 space-y-0.5")}
			{...props}
			ref={skeletonRef}
		>
			<ProblemListSkeletonItem ref={skeletonItemRef} />
			{Array.from({ length: itemsNum }).map((_, index) => (
				// eslint-disable-next-line react/no-array-index-key
				<ProblemListSkeletonItem key={index} />
			))}
		</div>
	)
}
