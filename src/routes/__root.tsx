import { createRootRoute, Outlet } from "@tanstack/react-router"
import { ToastContainer } from "react-toastify"
import { ThemeProvider } from "@/components/themes"
import "react-toastify/ReactToastify.css"

export const Route = createRootRoute({
	component: RootComponent,
})

function RootComponent() {
	return (
		<ThemeProvider>
			<ToastContainer
				position="bottom-right"
				autoClose={3000}
				style={{ zIndex: 9999 }}
			/>

			<Outlet />
		</ThemeProvider>
	)
}
