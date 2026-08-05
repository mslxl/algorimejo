import { LucideGlobe2, LucidePencil, LucideTrash2 } from "lucide-react"
import { toast } from "react-toastify"
import { PrefsItem, PrefsSection } from "@/components/prefs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckerCreateDialog } from "@/feat/checker/checker-create-dialog"
import { useCheckerDeleter } from "@/hooks/use-checker"
import { useCheckers } from "@/hooks/use-checker-names"
import { algorimejo } from "@/lib/algorimejo"

export function CheckersSection() {
	const checkers = useCheckers()
	const deleter = useCheckerDeleter()
	const custom = checkers.data?.filter(checker => checker.kind === "Custom") ?? []

	return (
		<PrefsSection section="Checkers">
			<PrefsItem name="Global Checkers" description="Checker source available to every problem in this workspace." className="items-stretch">
				<div className="w-full overflow-hidden rounded-md border">
					<div className="flex h-10 items-center border-b px-3">
						<span className="text-sm font-medium">Name</span>
						<span className="flex-1" />
						<CheckerCreateDialog globalOnly onCreated={checker => algorimejo.openCheckerTab({ checkerID: checker.id, title: checker.name, reuse: true })} />
					</div>
					{checkers.status === "pending" && <Skeleton className="h-20 w-full" />}
					{checkers.status === "error" && <div className="p-3 text-sm text-destructive">{String(checkers.error)}</div>}
					{checkers.status === "success" && custom.length === 0 && <div className="p-4 text-sm text-muted-foreground">No global custom checkers</div>}
					{custom.map(checker => (
						<div key={checker.id} className="flex h-11 items-center gap-3 border-b px-3 last:border-b-0">
							<LucideGlobe2 className="size-4 text-muted-foreground" />
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">{checker.name}</div>
								<div className="truncate text-xs text-muted-foreground">{checker.language}</div>
							</div>
							<Button type="button" size="icon" variant="ghost" title="Edit checker" onClick={() => algorimejo.openCheckerTab({ checkerID: checker.id, title: checker.name, reuse: true })}><LucidePencil /></Button>
							<AlertDialog>
								<AlertDialogTrigger asChild><Button type="button" size="icon" variant="ghost" title="Delete checker"><LucideTrash2 /></Button></AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											Delete
											{checker.name}
										</AlertDialogTitle>
										<AlertDialogDescription>Referenced checkers must be replaced before deletion.</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<AlertDialogAction onClick={() => deleter.mutate(checker.id, { onError: error => toast.error(error.message) })}>Delete</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					))}
				</div>
			</PrefsItem>
		</PrefsSection>
	)
}
