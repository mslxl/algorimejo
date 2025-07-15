import { configureStore } from "@reduxjs/toolkit";
import type { FC } from "react";
import { reducer as sidebarReducer } from "@/stores/sidebar-slice";
import { AlgorimejoApp } from "./app";
import { Disposable } from "./disposable";

export type PanelPosition = "left" | "right" | "bottom";
export type PanelProps = {
	key: string;
	path?: string | null;
	position: PanelPosition;
};
export interface PanelButtonProps {
	key: string;
	position: PanelPosition;
	isSelected: boolean;
	onClick?: () => void;
}
interface PanelAttrs {
	key: string;
	fc: FC<PanelProps>;
	button?: FC<PanelButtonProps>;
	defaultPosition: PanelPosition;
}
type MainUIProps = {
	path: string;
};

export class Algorimejo {
	private _app?: AlgorimejoApp;
	private _store = configureStore({
		reducer: {
			sidebar: sidebarReducer,
		},
	});

	private panels = new Map<string, PanelAttrs>();
	private ui = new Map<string, FC<MainUIProps>>();

	private isReady = false;
	private readyListener = new Set<() => void>();
	constructor() {
		(async () => {
			await Promise.all([
				AlgorimejoApp.create().then((app) => {
					this._app = app;
				}),
			]);
		})().then(() => {
			this.readyListener.forEach((f) => f());
			this.isReady = true;
		});
	}

	get app(): AlgorimejoApp {
		if (!this.isReady || !this._app) {
			throw new Error("app is not ready");
		}
		return this._app;
	}

	get store() {
		return this._store;
	}

	dispatch(...args: Parameters<(typeof this.store)["dispatch"]>) {
		this._store.dispatch(...args);
	}
	selectStateValue<T>(
		selector: (state: ReturnType<(typeof this.store)["getState"]>) => T,
	): T {
		return selector(this._store.getState());
	}
	watchState<T>(
		selector: (state: ReturnType<(typeof this.store)["getState"]>) => T,
		callback: (value: T) => void,
	) {
		let old: T | null = null;
		const unsub = this.store.subscribe(() => {
			const nu = selector(this.store.getState());
			if (nu !== old) {
				callback(nu);
				old = nu;
			}
		});
		return new Disposable(() => {
			unsub();
		});
	}

	getPanel(key: string): PanelAttrs {
		const panel = this.panels.get(key);

		if (!panel) {
			throw new Error(`panel ${key} is not defined in algorimejo`);
		}
		return panel;
	}

	providePanel(
		key: string,
		fc: FC<PanelProps>,
		defaultPosition?: PanelPosition,
		button?: FC<PanelButtonProps>,
	) {
		this.panels.set(key, {
			key,
			fc,
			button,
			defaultPosition: defaultPosition ?? "right",
		});
	}
	getUI(key: string): FC<MainUIProps> | null {
		return this.ui.get(key) ?? null;
	}
	provideUI(key: string, fc: FC<MainUIProps>) {
		this.ui.set(key, fc);
	}

	ready(callback: () => void) {
		if (this.isReady) {
			callback();
			return;
		}
		this.readyListener.add(callback);
	}
}
