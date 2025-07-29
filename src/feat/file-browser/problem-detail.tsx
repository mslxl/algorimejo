import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { LucideX } from "lucide-react";
import type { HTMLAttributes } from "react";
import type { Problem } from "@/lib/client";
import styles from "./problem-detail.module.css";

dayjs.extend(relativeTime);

interface ProblemDetailProps extends HTMLAttributes<HTMLDivElement> {
	problem: Problem;
}
export function ProblemDetail({ problem, ...props }: ProblemDetailProps) {
	const createDate = dayjs(problem.create_datetime);
	const modifiedDate = dayjs(problem.modified_datetime);
	return (
		<div {...props}>
			<h3 className="font-semibold">{problem.name}</h3>
			<p>{problem.description}</p>
			<table className={styles.detailTable}>
				<tbody>
					{problem.url && (
						<tr>
							<td>URL</td>
							<td>
								<a href={problem.url} target="_blank" rel="noreferrer">
									{problem.url}
								</a>
							</td>
						</tr>
					)}
					<tr>
						<td>Checker</td>
						<td>{problem.checker ?? <LucideX className="size-[1em]" />}</td>
					</tr>
					<tr>
						<td>Solutions</td>
						<td>{problem.solutions.length}</td>
					</tr>
					<tr>
						<td>Created At</td>
						<td>
							{createDate.toLocaleString()} ({createDate.toNow()})
						</td>
					</tr>
					<tr>
						<td>Updated At</td>
						<td>
							{modifiedDate.toLocaleString()} ({modifiedDate.toNow()})
						</td>
					</tr>
					<tr>
						<td>Time Span</td>
						<td>{createDate.to(modifiedDate, true)}</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
