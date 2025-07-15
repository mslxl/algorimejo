import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Algorimejo } from "@/components/layout";
import { useAppDispatch } from "@/hooks/use-app-dispatch";
import { replace } from "@/stores/sidebar-slice";

export const Route = createFileRoute("/")({
	component: RouteComponent,
});

function RouteComponent() {
	const dispatch = useAppDispatch();
	useEffect(() => {
		dispatch(
			replace({
				left: ["file-browser"],
				right: [],
				bottom: [],
			}),
		);
	}, [dispatch]);
	return <Algorimejo className="size-full" />;
}
