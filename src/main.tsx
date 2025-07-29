import { iconImage } from "@/assets";
import "@/index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { attachConsole, attachLogger, LogLevel } from "@tauri-apps/plugin-log";
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { match } from "ts-pattern";
import { loadFeatures } from "@/feat";
import { algorimejo } from "@/lib/algorimejo";
import { routeTree } from "@/routeTree.gen";

function initIcon() {
	const icon = document.createElement("link");
	icon.rel = "icon";
	icon.href = iconImage;
	document.head.appendChild(icon);
}
initIcon();

const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("root") as HTMLElement;
if (!rootElement.innerHTML) {
	setTimeout(() => {
		algorimejo.ready(async () => {
			await loadFeatures();
			await attachConsole();
			await attachLogger((payload) => {
				match(payload.level)
					.with(LogLevel.Warn, () => {
						console.warn(payload.message);
					})
					.with(LogLevel.Error, () => {
						console.error(payload.message);
					})
					.with(LogLevel.Debug, () => {
						console.debug(payload.message);
					})
					.with(LogLevel.Info, () => {
						console.info(payload.message);
					})
					.with(LogLevel.Trace, () => {
						console.trace(payload.message);
					})
					.otherwise(() => {
						console.log(payload.message);
					});
			});
			ReactDOM.createRoot(rootElement).render(
				<React.StrictMode>
					<Provider store={algorimejo.store}>
						<QueryClientProvider client={algorimejo.queryClient}>
							<RouterProvider router={router} />
						</QueryClientProvider>
					</Provider>
				</React.StrictMode>,
			);
		});
	}, 0);
}
