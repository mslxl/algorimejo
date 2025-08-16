import type { Problem } from "@/lib/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "react-toastify"
import { z } from "zod"
import { ErrorLabel } from "@/components/error-label"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useCheckerNames } from "@/hooks/use-checker-names"
import { useProblem } from "@/hooks/use-problem"
import { useProblemChangeset } from "@/hooks/use-problem-changeset"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

const problemSettingFormSchema = z.object({
	name: z.string(),
	url: z.url().optional(),
	description: z.string(),
	statement: z.string().optional(),
	checker: z.string(),
	time_limit: z.number(),
	memory_limit: z.number(),
})

interface ProblemSettingContentProps extends ProblemSettingProps {
	problemData: Problem
	availableCheckerNames: string[]
}

export function ProblemSettingContent({ problemID, problemData, availableCheckerNames, onCancel, onSubmitCompleted }: ProblemSettingContentProps) {
	const form = useForm<z.infer<typeof problemSettingFormSchema>>({
		resolver: zodResolver(problemSettingFormSchema),
		defaultValues: {
			name: problemData.name,
			url: problemData.url ?? undefined,
			description: problemData.description,
			statement: problemData.statement ?? undefined,
			checker: problemData.checker ?? undefined,
			time_limit: problemData.time_limit,
			memory_limit: problemData.memory_limit,
		},
	})
	const problemChangesetMutation = useProblemChangeset()
	function handleSubmit(data: z.infer<typeof problemSettingFormSchema>) {
		const convertNullIfEmpty = (value: string | undefined | null) => {
			if (value === undefined || value === null) {
				return null
			}
			if (value.trim().length === 0) {
				return null
			}
			return value
		}
		problemChangesetMutation.mutate({
			id: problemID,
			changeset: {
				name: data.name,
				url: convertNullIfEmpty(data.url),
				description: data.description,
				statement: convertNullIfEmpty(data.statement),
				checker: data.checker,
				time_limit: data.time_limit,
				memory_limit: data.memory_limit,
			},
		}, {
			onSuccess: () => {
				onSubmitCompleted?.()
			},
			onError: (error) => {
				if (error instanceof Error) {
					toast.error(`Fail to save: ${error.message}`)
				}
				else {
					toast.error(`Fail to save: ${error}`)
				}
			},
		})
	}
	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => {
						return (
							<FormItem>
								<FormLabel className="font-medium">Name</FormLabel>
								<FormControl>
									<Input {...field} className="w-full" placeholder="Enter problem name" />
								</FormControl>
								<FormMessage />
							</FormItem>
						)
					}}
				/>
				<FormField
					control={form.control}
					name="url"
					render={({ field }) => {
						return (
							<FormItem>
								<FormLabel className="font-medium">URL</FormLabel>
								<FormControl>
									<div className="flex items-center gap-2">
										<Input {...field} autoComplete="off" autoCorrect="off" className="flex-1" placeholder="Enter problem URL" />
									</div>
								</FormControl>
								<FormMessage />
							</FormItem>
						)
					}}
				/>
				<FormField
					control={form.control}
					name="description"
					render={({ field }) => {
						return (
							<FormItem>
								<FormLabel className="font-medium">Description</FormLabel>
								<FormControl>
									<Textarea {...field} className="w-full" placeholder="Enter problem description" />
								</FormControl>
								<FormMessage />
							</FormItem>
						)
					}}
				/>
				<FormField
					control={form.control}
					name="statement"
					render={({ field }) => {
						return (
							<FormItem>
								<FormLabel className="font-medium">Statement</FormLabel>
								<FormControl>
									<Textarea {...field} className="w-full" placeholder="Enter problem statement" />
								</FormControl>
								<FormMessage />
							</FormItem>
						)
					}}
				/>
				<FormField
					control={form.control}
					name="checker"
					render={({ field }) => {
						return (
							<FormItem>
								<FormLabel className="font-medium">Checker</FormLabel>
								<Select onValueChange={field.onChange} defaultValue={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{
											availableCheckerNames.map(name => (
												<SelectItem key={name} value={name}>
													{name}
												</SelectItem>
											))
										}
									</SelectContent>
								</Select>
							</FormItem>
						)
					}}
				/>
				<div className="grid grid-cols-1 gap-2 md:grid-cols-2">

					<FormField
						control={form.control}
						name="time_limit"
						render={({ field }) => {
							return (
								<FormItem>
									<FormLabel className="font-medium">Time Limit (ms)</FormLabel>
									<FormControl>
										<Input {...field} className="w-full" placeholder="Enter problem time limit" />
									</FormControl>
									<FormMessage />
								</FormItem>
							)
						}}
					/>
					<FormField
						control={form.control}
						name="memory_limit"
						render={({ field }) => {
							return (
								<FormItem>
									<FormLabel className="font-medium">Memory Limit (KiB)</FormLabel>
									<FormControl>
										<Input {...field} className="w-full" placeholder="Enter problem memory limit" />
									</FormControl>
								</FormItem>
							)
						}}
					/>
				</div>

				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" onClick={onCancel} variant="outline">Cancel</Button>
					<Button type="submit">Save Changes</Button>
				</div>
			</form>
		</Form>
	)
}

interface ProblemSettingProps {
	problemID: string
	onSubmitCompleted?: () => void
	onCancel?: () => void
}
export function ProblemSetting({ problemID, ...props }: ProblemSettingProps) {
	const problemData = useProblem(problemID)
	const checkerNames = useCheckerNames()
	if (problemData.status === "error") {
		return <ErrorLabel message={problemData.error} location="get problem data" />
	}
	else if (checkerNames.status === "error") {
		return <ErrorLabel message={checkerNames.error} location="get available checkers" />
	}
	else if (problemData.status === "pending" || checkerNames.status === "pending") {
		return (
			<div>
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		)
	}
	return <ProblemSettingContent problemID={problemID} problemData={problemData.data} availableCheckerNames={checkerNames.data} {...props} />
}
