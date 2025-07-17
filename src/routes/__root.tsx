import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ToastContainer } from "react-toastify";
import "react-toastify/ReactToastify.css";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<>
			<Outlet />
			<ToastContainer />
		</>
	);
}
