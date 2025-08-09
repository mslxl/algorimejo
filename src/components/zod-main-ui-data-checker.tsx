import type { FC } from "react"
import type * as z from "zod"
import type { MainUIProps } from "@/lib/algorimejo/algorimejo"
import * as log from "@tauri-apps/plugin-log"
import { useState } from "react"

export function withMainUIData<Z extends z.ZodObject, T extends z.infer<Z>>(
	schema: Z,
	component: FC<MainUIProps<T>>,
) {
	const Content = component
	return ({ data }: MainUIProps<T>) => {
		const result = schema.safeParse(data)
		const isValid = result.success
		const errorMessage = result.error?.message ?? ""

		if (!result.success) {
			log.error("Main UI Component error")
			log.error(`Invalid data: ${JSON.stringify(result.error, null, 2)}`)
		}

		if (isValid)
			return <Content data={data} />

		return (
			<div className="mx-auto max-w-2xl p-8">
				<div className="rounded-lg border border-destructive bg-destructive/10 p-6">
					<h3 className="mb-4 text-2xl font-semibold text-destructive">
						Invalid Data Error:
						{" "}
						{errorMessage}
					</h3>
					<p className="mb-6 text-muted-foreground">
						An error occurred while validating the data. Please report this
						issue to the developer with the details below to help resolve it.
					</p>
					<div className="overflow-auto rounded-md bg-muted p-4">
						<pre className="text-sm">
							<code>{JSON.stringify(data, null, 2)}</code>
						</pre>
					</div>
				</div>
			</div>
		)
	}
}
