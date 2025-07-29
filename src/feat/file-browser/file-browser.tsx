import {
	LucideFilePlus2,
	LucideListCollapse,
	LucideRefreshCcw,
	LucideSortAsc,
	LucideSortDesc,
} from "lucide-react";
import { type CSSProperties, useState } from "react";
import { match } from "ts-pattern";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const buttonStyle: CSSProperties = {
	width: "16px",
	height: "16px",
};

export function FileBrowser() {
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
	return (
		<div>
			<div className="flex justify-end gap-0.5 border-b">
				<Tooltip>
					<TooltipTrigger asChild>
						<button type="button" className="hover:bg-secondary rounded-md p-1">
							<LucideFilePlus2 style={buttonStyle} />
						</button>
					</TooltipTrigger>
					<TooltipContent>New Problem...</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button type="button" className="hover:bg-secondary rounded-md p-1">
							<LucideRefreshCcw style={buttonStyle} />
						</button>
					</TooltipTrigger>
					<TooltipContent>Refresh Explorer</TooltipContent>
				</Tooltip>

				<Popover>
					<PopoverTrigger asChild>
						<button type="button" className="hover:bg-secondary rounded-md p-1">
							{match(sortOrder)
								.with("asc", () => <LucideSortAsc style={buttonStyle} />)
								.with("desc", () => <LucideSortDesc style={buttonStyle} />)
								.exhaustive()}
						</button>
					</PopoverTrigger>
					<PopoverContent></PopoverContent>
				</Popover>

				<Tooltip>
					<TooltipTrigger asChild>
						<button type="button" className="hover:bg-secondary rounded-md p-1">
							<LucideListCollapse style={buttonStyle} />
						</button>
					</TooltipTrigger>
					<TooltipContent>Collapse Problems in Explorer</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
