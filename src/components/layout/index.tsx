import type { HTMLAttributes } from "react"
import type { PanelPosition } from "@/lib/algorimejo/algorimejo"
import { css } from "@emotion/css"
import * as log from "@tauri-apps/plugin-log"
import { useCallback, useState } from "react"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable"
import { algorimejo } from "@/lib/algorimejo"
import { useObservable } from "@/lib/observable"
import { cn } from "@/lib/utils"
import { AlgorimejoMenubar } from "./menubar"
import { SidebarButtonDefault } from "./sidebar-button-default"
import { TabContainer } from "./tab-container"

interface AlgorimejoProps extends HTMLAttributes<HTMLDivElement> {}

const sidebarButtonClassname = css`
& > * {
	writing-mode: vertical-rl;
	width: 100%;
}
`

const sidebarPanelClassname = css`
&>* {
	width: 100%;
	height: 100%;
}
`

export function Algorimejo({ className, ...props }: AlgorimejoProps) {
	const leftDockKeys = useObservable(algorimejo.dock.left)
	const rightDockKeys = useObservable(algorimejo.dock.right)

	const bottomSelectedID = useObservable(algorimejo.dock.bottomSelected)
	const leftSelectedID = useObservable(algorimejo.dock.leftSelected)
	const rightSelectedID = useObservable(algorimejo.dock.rightSelected)

	const isBottomOpen = bottomSelectedID !== null
	const isLeftOpen = leftSelectedID !== null
	const isRightOpen = rightSelectedID !== null

	const [openLeftSize, setOpenLeftSize] = useState(25)
	const [openRightSize, setOpenRightSize] = useState(25)
	const [openBottomSize, setOpenBottomSize] = useState(25)

	// keys: All dock id need to be rendered
	// position: one of `left`, `right` or `bottom`
	// currentSelectedID: the selected dock id in the position
	// selectFn: The select function in the position, it should accepted `null` that means unselect
	const renderSidebarButton = useCallback(
		(keys: string[], position: PanelPosition, currentSelectedID: string | null, selectFn: (id: string | null) => void) => {
			const handleToggle = (key: string) => {
				if (currentSelectedID === key) {
					log.trace(`unselect panel ${key}`)
					selectFn(null)
				}
				else {
					log.trace(`select panel ${key}`)
					selectFn(key)
				}
			}

			return keys.map((key) => {
				const attr = algorimejo.getPanel(key)
				const Btn = attr?.button ?? SidebarButtonDefault

				return (
					<Btn
						key={key}
						position={position}
						isSelected={key === currentSelectedID}
						onClick={() => handleToggle(key)}
					/>
				)
			})
		},
		[],
	)

	const renderSidebarPanel = useCallback(
		(position: PanelPosition, currentSelectedID: string | null) => {
			if (!currentSelectedID) {
				return
			}

			const attrs = algorimejo.getPanel(currentSelectedID)
			const Panel = attrs.fc
			return <Panel key={currentSelectedID} position={position} />
		},
		[],
	)

	return (
		<div className={cn(className, "flex flex-col")} {...props}>
			<AlgorimejoMenubar />
			<div className="flex min-h-0 flex-1">
				<div
					className={cn(
						"border-r w-8 space-x-1",
						sidebarButtonClassname,
					)}
				>
					{renderSidebarButton(leftDockKeys, "left", leftSelectedID, id => algorimejo.dock.select("left", id))}
				</div>
				<ResizablePanelGroup className="flex-1" direction="horizontal">
					{!isLeftOpen
						? null
						: (
								<>
									<ResizablePanel
										id="left-panel"
										order={1}
										onResize={setOpenLeftSize}
										defaultSize={openLeftSize}
										className={sidebarPanelClassname}
									>
										{renderSidebarPanel("left", leftSelectedID)}
									</ResizablePanel>
									<ResizableHandle />
								</>
							)}

					<ResizablePanel id="center-container-panel" order={2}>
						<ResizablePanelGroup className="size-full" direction="vertical">
							<ResizablePanel id="tab-container-panel" order={1}>
								<TabContainer className="size-full" />
							</ResizablePanel>
							{!isBottomOpen
								? null
								: (
										<>
											<ResizableHandle />
											<ResizablePanel
												id="bottom-panel"
												order={2}
												defaultSize={openBottomSize}
												onResize={setOpenBottomSize}
												className={sidebarPanelClassname}
											>
												{renderSidebarPanel("bottom", bottomSelectedID)}
											</ResizablePanel>
										</>
									)}
						</ResizablePanelGroup>
					</ResizablePanel>
					{!isRightOpen
						? null
						: (
								<>
									<ResizableHandle />
									<ResizablePanel
										id="right-panel"
										order={3}
										onResize={setOpenRightSize}
										defaultSize={openRightSize}
										className={sidebarPanelClassname}
									>
										{renderSidebarPanel("right", rightSelectedID)}
									</ResizablePanel>
								</>
							)}
				</ResizablePanelGroup>
				<div className={cn("border-l w-8", sidebarButtonClassname)}>
					{renderSidebarButton(rightDockKeys, "right", rightSelectedID, id => algorimejo.dock.select("right", id))}
				</div>
			</div>
			<div className="h-5 border-t"></div>
		</div>
	)
}
