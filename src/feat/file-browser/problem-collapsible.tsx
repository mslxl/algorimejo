import { LucideFileCheck, LucideFileEdit } from "lucide-react";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Problem } from "@/lib/client";

interface ProblemCollapsibleProps {
	problem: Problem;
}

export function ProblemCollapsible({ problem }: ProblemCollapsibleProps) {
	return (
		<Collapsible>
			<CollapsibleTrigger>
				<LucideFileEdit />
				{/* <LucideFileCheck/> */}
			</CollapsibleTrigger>
		</Collapsible>
	);
}
