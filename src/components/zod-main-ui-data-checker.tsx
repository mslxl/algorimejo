import * as log from "@tauri-apps/plugin-log";
import { type FC, useEffect, useLayoutEffect, useState } from "react";
import type * as z from "zod";
import type { MainUIProps } from "@/lib/algorimejo/algorimejo";
import { Skeleton } from "./ui/skeleton";

export function withMainUIData<Z extends z.ZodObject, T extends z.infer<Z>>(
	schema: Z,
	component: FC<MainUIProps<T>>,
) {
	const Content = component;
	return ({ data }: MainUIProps<T>) => {
		const [isFinsih, setFinish] = useState(false);
		const [isValid, setIsValid] = useState(false);
		const [message, setErrorMessage] = useState<string | null>(null);

		useEffect(() => {
			const result = schema.safeParse(data);
			setIsValid(result.success);

			if (!result.success) {
				log.error("Main UI Component error");
				log.error(`Invalid data: ${JSON.stringify(result.error, null, 2)}`);
				setErrorMessage(result.error.message);
			}
			setFinish(true);
		}, [data, schema]);

		if (!isFinsih) {
			return (
				<div className="p-4 space-y-2">
					<Skeleton className="h-[1em]" />
					<Skeleton className="h-[1em]" />
					<Skeleton className="h-[1em]" />
				</div>
			);
		}

		if (isValid) return <Content data={data} />;

		return (
			<div className="p-8 max-w-2xl mx-auto">
				<div className="bg-destructive/10 border border-destructive rounded-lg p-6">
					<h3 className="text-2xl font-semibold text-destructive mb-4">
						Invalid Data Error: {message}
					</h3>
					<p className="text-muted-foreground mb-6">
						An error occurred while validating the data. Please report this
						issue to the developer with the details below to help resolve it.
					</p>
					<div className="bg-muted rounded-md p-4 overflow-auto">
						<pre className="text-sm">
							<code>{JSON.stringify(data, null, 2)}</code>
						</pre>
					</div>
				</div>
			</div>
		);
	};
}
