import { type HTMLAttributes, useCallback, useState } from "react";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAppDispatch } from "@/hooks/use-app-dispatch";
import { useAppSelector } from "@/hooks/use-app-selector";
import { algorimejo } from "@/lib/algorimejo";
import type { PanelPosition } from "@/lib/algorimejo/algorimejo";
import { cn } from "@/lib/utils";
import { select, unselect } from "@/stores/sidebar-slice";
import stylesheet from "./index.module.scss";
import { AlgorimejoMenubar } from "./menubar";
import { SidebarButtonDefault } from "./sidebar-button-default";
import { TabContainer } from "./tab-container";

interface AlgorimejoProps extends HTMLAttributes<HTMLDivElement> {}
export function Algorimejo({ className, ...props }: AlgorimejoProps) {
	const sidebar = useAppSelector((state) => state.sidebar);
	const dispatch = useAppDispatch();

	const openLeft = sidebar.leftSelected !== null;
	const openRight = sidebar.rightSelected !== null;
	const openBottom = sidebar.bottomSelected !== null;

	const [openLeftSize, setOpenLeftSize] = useState(25);
	const [openRightSize, setOpenRightSize] = useState(25);
	const [openBottomSize, setOpenBottomSize] = useState(25);

	const renderSidebarButton = useCallback(
		(keys: string[], position: PanelPosition) => {
			const handleToggle = (key: string) => {
				if (sidebar[`${position}Selected`] === key) {
					console.log(`unselect panel ${key}`);
					dispatch(
						unselect({
							position,
						}),
					);
				} else {
					console.log(`select panel ${key}`);
					dispatch(
						select({
							key,
						}),
					);
				}
			};

			return keys.map((key) => {
				const attr = algorimejo.getPanel(key);
				const Btn = attr?.button ?? SidebarButtonDefault;

				return (
					<Btn
						key={key}
						position={position}
						isSelected={key === sidebar[`${position}Selected`]}
						onClick={() => handleToggle(key)}
					/>
				);
			});
		},
		[sidebar, dispatch],
	);

	const renderSidebarPanel = useCallback(
		(position: PanelPosition) => {
			const selection = sidebar[`${position}Selected`];
			if (!selection) {
				return;
			}

			const attrs = algorimejo.getPanel(selection);
			const Panel = attrs.fc;
			return <Panel key={selection} position={position} />;
		},
		[sidebar],
	);

	return (
		<div className={cn(className, "flex flex-col")} {...props}>
			<AlgorimejoMenubar />
			<div className="flex-1 flex min-h-0">
				<div
					className={cn(
						"border-r w-8 space-x-1",
						stylesheet.sidebarButtonGroup,
					)}
				>
					{renderSidebarButton(sidebar.left, "left")}
				</div>
				<ResizablePanelGroup className="flex-1" direction="horizontal">
					{!openLeft ? null : (
						<>
							<ResizablePanel
								order={1}
								onResize={setOpenLeftSize}
								defaultSize={openLeftSize}
								className={stylesheet.sidebarPanel}
							>
								{renderSidebarPanel("left")}
							</ResizablePanel>
							<ResizableHandle />
						</>
					)}

					<ResizablePanel order={2}>
						<ResizablePanelGroup className="size-full" direction="vertical">
							<ResizablePanel order={1}>
								<TabContainer className="size-full" />
							</ResizablePanel>
							{!openBottom ? null : (
								<>
									<ResizableHandle />
									<ResizablePanel
										order={2}
										defaultSize={openBottomSize}
										onResize={setOpenBottomSize}
										className={stylesheet.sidebarPanel}
									>
										{renderSidebarPanel("bottom")}
									</ResizablePanel>
								</>
							)}
						</ResizablePanelGroup>
					</ResizablePanel>
					{!openRight ? null : (
						<>
							<ResizableHandle />
							<ResizablePanel
								order={3}
								onResize={setOpenRightSize}
								defaultSize={openRightSize}
								className={stylesheet.sidebarPanel}
							>
								{renderSidebarPanel("right")}
							</ResizablePanel>
						</>
					)}
				</ResizablePanelGroup>
				<div className={cn("border-l w-8", stylesheet.sidebarButtonGroup)}>
					{renderSidebarButton(sidebar.right, "right")}
				</div>
			</div>
			<div className="border-t h-5"></div>
		</div>
	);
}
