// TODO: add remote server

import { toast } from "react-toastify"
import { match } from "ts-pattern"
import { algorimejo } from "../algorimejo"
import { events } from "./local"

export * from "./local"

events.queryClientInvalidateEvent.listen((e) => {
	if (e.payload.query_key) {
		algorimejo.queryClient.invalidateQueries({ queryKey: e.payload.query_key })
	}
	else {
		algorimejo.queryClient.invalidateQueries()
	}
})

events.toastEvent.listen((e) => {
	const makeToast = match(e.payload.kind)
		.with("Error", () => toast.error)
		.with("Info", () => toast.info)
		.with("Success", () => toast.success)
		.with("Warning", () => toast.warning)
		.exhaustive()
	makeToast(e.payload.message)
})
