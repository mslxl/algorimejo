import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"
import { Algorimejo } from "@/components/layout"
import { algorimejo } from "@/lib/algorimejo"

export const Route = createFileRoute("/")({
	component: RouteComponent,
})

function RouteComponent() {
	useEffect(() => {
		algorimejo.dock.replace({
			left: ["file-browser", "testcase"],
			right: [],
			bottom: ["terminal"],
		})
		// Show the problem list on startup so there is always something to act on
		algorimejo.dock.select("left", "file-browser")
	}, [])
	return (
		<Algorimejo className="size-full" />
	)
}
