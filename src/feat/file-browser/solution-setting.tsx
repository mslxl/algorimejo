import type { AdvLanguageItem, Solution } from "@/lib/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "react-toastify"
import * as z from "zod"
import { ErrorLabel } from "@/components/error-label"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useAvailableLanguage } from "@/hooks/use-available-language"
import { useSolution } from "@/hooks/use-solution"
import { useSolutionChangeset } from "@/hooks/use-solution-changeset"

interface SolutionSettingContentProps extends SolutionSettingProps {
	solutionData: Solution
	availableLanguages: Map<string, AdvLanguageItem>
	onCancel?: () => void
	onSubmitCompleted?: () => void
}

const solutionSchema = z.object({
	name: z.string(),
	author: z.string().optional(),
	language: z.string(),
})
function SolutionSettingContent({ solutionData, availableLanguages, solutionID, onSubmitCompleted, onCancel }: SolutionSettingContentProps) {
	const form = useForm<z.infer<typeof solutionSchema>>({
		resolver: zodResolver(solutionSchema),
		defaultValues: {
			name: solutionData.name,
			author: solutionData.author,
			language: solutionData.language,
		},
	})

	const changesetMutation = useSolutionChangeset()

	function handleSubmit(data: z.infer<typeof solutionSchema>) {
		changesetMutation.mutate({
			id: solutionID,
			problemID: solutionData.problem_id,
			changeset: {
				name: data.name,
				author: data.author ?? null,
				language: data.language,
			},
		}, {
			onSuccess: () => {
				onSubmitCompleted?.()
			},
			onError: (error) => {
				if (error instanceof Error) {
					toast.error(error.message)
				}
				else {
					toast.error(`Failed to update solution: ${error}`)
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
								<FormLabel className="font-medium">
									Name
								</FormLabel>
								<FormControl>
									<Input {...field} className="w-full" placeholder="Enter solution name" />
								</FormControl>
							</FormItem>
						)
					}}
				/>
				<FormField
					control={form.control}
					name="author"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="font-medium">
								Author
							</FormLabel>
							<FormControl>
								<Input {...field} className="w-full" placeholder="Enter author name" />
							</FormControl>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="language"
					render={({ field }) => {
						return (
							<FormItem>
								<FormLabel className="font-medium">
									Language
								</FormLabel>
								<Select onValueChange={field.onChange} defaultValue={field.value}>
									<FormControl>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{
											Array.from(availableLanguages.keys()).map(key => (
												<SelectItem key={key} value={key}>
													{key}
												</SelectItem>
											))
										}
									</SelectContent>

								</Select>
							</FormItem>
						)
					}}
				/>
				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" onClick={onCancel} variant="outline">Cancel</Button>
					<Button type="submit">Save Changes</Button>
				</div>
			</form>
		</Form>
	)
}

interface SolutionSettingProps {
	solutionID: string
	problemID: string
	onCancel?: () => void
	onSubmitCompleted?: () => void
}
export function SolutionSetting({ solutionID, problemID, ...props }: SolutionSettingProps) {
	const solutionData = useSolution(solutionID, problemID)
	const availableLanguages = useAvailableLanguage()
	if (solutionData.status === "error") {
		return <ErrorLabel message={solutionData.error} />
	}
	else if (availableLanguages.status === "error") {
		return <ErrorLabel message={availableLanguages.error} />
	}
	else if (solutionData.status === "pending" || availableLanguages.status === "pending") {
		return (
			<div>
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		)
	}
	return (
		<SolutionSettingContent
			solutionData={solutionData.data}
			availableLanguages={availableLanguages.data}
			solutionID={solutionID}
			problemID={problemID}
			{...props}
		/>
	)
}
