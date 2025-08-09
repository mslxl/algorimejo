import { QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { attachConsole } from "@tauri-apps/plugin-log"
import React from "react"
import ReactDOM from "react-dom/client"
import { Provider } from "react-redux"
import { iconImage } from "@/assets"
import { loadFeatures } from "@/feat"
import { algorimejo } from "@/lib/algorimejo"
import { routeTree } from "@/routeTree.gen"
import "@/index.css"

function initIcon() {
	const icon = document.createElement("link")
	icon.rel = "icon"
	icon.href = iconImage
	document.head.appendChild(icon)
}
initIcon()

const router = createRouter({ routeTree })
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router
	}
}

const rootElement = document.getElementById("root") as HTMLElement
if (!rootElement.innerHTML) {
	setTimeout(() => {
		algorimejo.ready(async () => {
			await loadFeatures()
			await attachConsole()
			ReactDOM.createRoot(rootElement).render(
				<React.StrictMode>
					<Provider store={algorimejo.store}>
						<QueryClientProvider client={algorimejo.queryClient}>
							<RouterProvider router={router} />
						</QueryClientProvider>
					</Provider>
				</React.StrictMode>,
			)
		})
	}, 0)
}
