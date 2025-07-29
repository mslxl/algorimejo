import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import * as log from "@tauri-apps/plugin-log";
import type { FC, SVGAttributes } from "react";

export interface Tab {
	key: string;
	data: unknown;
}

export interface OpenedTab extends Tab {
	id: string;
	title: string;
	icon?: FC<SVGAttributes<SVGElement>>;
}

export type TabState = {
	tabs: OpenedTab[];
	selected: number;
};

const tabSlice = createSlice({
	name: "tab",
	initialState: {
		tabs: [],
		selected: -1,
	} as TabState,

	reducers: {
		create: (state, action: PayloadAction<OpenedTab>) => {
			state.tabs.push(action.payload);
			state.selected = state.tabs.length - 1;
		},
		select: (state, action: PayloadAction<number>) => {
			state.selected = action.payload;
		},
		close: (state, action: PayloadAction<number>) => {
			state.tabs.splice(action.payload, 1);
			if (state.selected > action.payload) {
				state.selected -= 1;
			} else if (state.selected === action.payload) {
				state.selected = -1;
			}
		},
		rename: (
			state,
			action: PayloadAction<{ index: number; title: string }>,
		) => {
			const { index, title } = action.payload;
			log.trace(`rename tab${index} to ${title}`);
			if (state.tabs[index]) {
				state.tabs[index].title = title;
			}
		},
		changeIcon: (
			state,
			action: PayloadAction<{
				index: number;
				icon: FC<SVGAttributes<SVGElement>>;
			}>,
		) => {
			const { index, icon } = action.payload;
			if (state.tabs[index]) {
				state.tabs[index].icon = icon;
			}
		},
	},
});

export const { create, select, close, rename, changeIcon } = tabSlice.actions;
export const reducer = tabSlice.reducer;
