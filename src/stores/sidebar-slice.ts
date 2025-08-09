import type { PayloadAction } from "@reduxjs/toolkit"
import type { PanelPosition } from "@/lib/algorimejo/algorimejo"
import { createSlice } from "@reduxjs/toolkit"
import { contains } from "lodash/fp"
import { algorimejo } from "@/lib/algorimejo"

export interface SidebarState {
	left: string[]
	leftSelected: string | null
	right: string[]
	rightSelected: string | null
	bottom: string[]
	bottomSelected: string | null
}

const selectedProp = [
	"leftSelected",
	"rightSelected",
	"bottomSelected",
] as const
const positionProp = ["left", "right", "bottom"] as const

const sidebarSlice = createSlice({
	name: "sidebar",
	initialState: {
		left: [],
		right: [],
		bottom: [],
		leftSelected: null,
		rightSelected: null,
		bottomSelected: null,
	} as SidebarState,

	reducers: {
		replace: (
			state,
			action: PayloadAction<{
				left: string[]
				right: string[]
				bottom: string[]
			}>,
		) => {
			state.bottom = action.payload.bottom
			state.left = action.payload.left
			state.right = action.payload.right
		},
		open: (
			state,
			action: PayloadAction<{
				key: string
				position?: PanelPosition
			}>,
		) => {
			const key = action.payload.key
			const isOpenIn = contains(key)

			const existsPos = [
				isOpenIn(state.left),
				isOpenIn(state.right),
				isOpenIn(state.bottom),
			].indexOf(true)

			const attrs = algorimejo.getPanel(key)
			if (existsPos === -1) {
				state[action.payload.position ?? attrs.defaultPosition].push(key)
			}
			else if (
				existsPos
				=== positionProp.indexOf(action.payload.position ?? attrs.defaultPosition)
			) {
				// already open in corresponsed position, do noting

			}
			else {
				// remove the old one, and add a new one in corresponsed position
				state[positionProp[existsPos]] = state[positionProp[existsPos]].filter(
					k => k !== key,
				)
				state[action.payload.position ?? attrs.defaultPosition].push(key)
			}
		},
		unselect: (
			state,
			action: PayloadAction<{
				position: PanelPosition
			}>,
		) => {
			state[`${action.payload.position}Selected`] = null
		},
		select: (
			state,
			action: PayloadAction<{
				key: string
			}>,
		) => {
			const key = action.payload.key
			const isOpenIn = contains(key)

			let existsPos = [
				isOpenIn(state.left),
				isOpenIn(state.right),
				isOpenIn(state.bottom),
			].indexOf(true)
			if (existsPos === -1) {
				const attrs = algorimejo.getPanel(key)
				state[attrs.defaultPosition].push(key)
				existsPos = positionProp.indexOf(attrs.defaultPosition)
			}
			const propName = selectedProp[existsPos]
			state[propName] = key
		},
	},
})

export const { select, open, replace, unselect } = sidebarSlice.actions
export const reducer = sidebarSlice.reducer
