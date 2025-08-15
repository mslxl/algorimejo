import type { FC } from "react"
import type { CreateEditorTabOptions, CreateSolutionEditorTabOptions, CreateTabOptions } from "./options"
import { configureStore } from "@reduxjs/toolkit"
import { QueryClient } from "@tanstack/react-query"
import * as log from "@tauri-apps/plugin-log"
import { uniqueId } from "lodash/fp"
import { Editor, SolutionEditor } from "@/feat/editor/editor"
import { selectEditorDocumentTabIndex, selectSolutionEditorTabIndex } from "@/feat/editor/utils"
import { ProgramPreference } from "@/feat/program-pref"
import { WorkspacePreference } from "@/feat/workspace-pref"
import { reducer as sidebarReducer } from "@/stores/sidebar-slice"
import * as tabActions from "@/stores/tab-slice"
import { reducer as tabReducer } from "@/stores/tab-slice"
import { AlgorimejoApp } from "./app"
import { Disposable } from "./disposable"

export type PanelPosition = "left" | "right" | "bottom"
export interface PanelProps {
	key: string
	position: PanelPosition
}
export interface PanelButtonProps {
	key: string
	position: PanelPosition
	isSelected: boolean
	onClick?: () => void
}
interface PanelAttrs {
	key: string
	fc: FC<PanelProps>
	button?: FC<PanelButtonProps>
	defaultPosition: PanelPosition
}
export interface MainUIProps<T = unknown> {
	data: T
}

export type StateSelector<T> = (
	state: ReturnType<Algorimejo["store"]["getState"]>,
) => T

// This is a workaround to make the type checker happy
export function makeStateSelector<T>(
	selector: StateSelector<T>,
): StateSelector<T> {
	return state => selector(state)
}

export class Algorimejo {
	private _app?: AlgorimejoApp
	private _store = configureStore({
		reducer: {
			sidebar: sidebarReducer,
			tab: tabReducer,
		},
	})

	private _queryClient = new QueryClient()

	private panels = new Map<string, PanelAttrs>()
	private ui = new Map<string, FC<MainUIProps>>()

	private isReady = false
	private readyListener = new Set<() => void>()
	constructor() {
		(async () => {
			this.provideUI("editor", Editor)
			this.provideUI("solution-editor", SolutionEditor)
			this.provideUI("workspace-pref", WorkspacePreference)
			this.provideUI("program-pref", ProgramPreference)
			await Promise.all([
				AlgorimejoApp.create().then((app) => {
					this._app = app
				}),
			])
		})().then(() => {
			this.readyListener.forEach(f => f())
			this.isReady = true
		})
	}

	get app(): AlgorimejoApp {
		if (!this.isReady || !this._app) {
			throw new Error("app is not ready")
		}
		return this._app
	}

	get store() {
		return this._store
	}

	get queryClient() {
		return this._queryClient
	}

	dispatch(...args: Parameters<(typeof this.store)["dispatch"]>) {
		this._store.dispatch(...args)
	}

	selectStateValue<T>(selector: StateSelector<T>): T {
		return selector(this._store.getState())
	}

	watchState<T>(selector: StateSelector<T>, callback: (value: T) => void) {
		let old: T | null = null
		const unsub = this.store.subscribe(() => {
			const nu = selector(this.store.getState())
			if (nu !== old) {
				callback(nu)
				old = nu
			}
		})
		return new Disposable(() => {
			unsub()
		})
	}

	getPanel(key: string): PanelAttrs {
		const panel = this.panels.get(key)

		if (!panel) {
			throw new Error(`panel ${key} is not defined in algorimejo`)
		}
		return panel
	}

	providePanel(
		key: string,
		fc: FC<PanelProps>,
		defaultPosition?: PanelPosition,
		button?: FC<PanelButtonProps>,
	) {
		log.trace(`Panel ${key} provided`)
		this.panels.set(key, {
			key,
			fc,
			button,
			defaultPosition: defaultPosition ?? "right",
		})
	}

	getUI(key: string): FC<MainUIProps> | null {
		return this.ui.get(key) ?? null
	}

	provideUI<T = unknown>(key: string, fc: FC<MainUIProps<T>>) {
		// Cast to FC<MainUIProps<unknown>> to satisfy type checker
		log.trace(`UI ${key} provided`)
		this.ui.set(key, fc as FC<MainUIProps<unknown>>)
	}

	selectTab(index: number) {
		this.dispatch(tabActions.select(index))
	}

	createTab(
		key: string,
		data: unknown,
		{ title, icon }: CreateTabOptions,
	): string {
		const id = uniqueId("tab")
		this.dispatch(
			tabActions.create({
				key,
				id,
				data,
				title,
				icon,
			}),
		)
		return id
	}

	createWorkspacePrefTab() {
		this.createTab("workspace-pref", {}, {
			title: "Workspace Preferences",
			icon: "LucideColumnsSettings",
		})
	}

	createProgramPrefTab() {
		this.createTab("program-pref", {}, {
			title: "Program Preferences",
			icon: "LucideSettings2",
		})
	}

	createEditorTab(
		documentID: string,
		problemID: string,
		solutionID: string,
		{ reuseTab = true, language, ...options }: CreateEditorTabOptions,
	) {
		const index = reuseTab
			? this.selectStateValue(selectEditorDocumentTabIndex(documentID))
			: -1
		if (index === -1) {
			return this.createTab(
				"editor",
				{
					documentID,
					language,
					problemID,
					solutionID,
				},
				options,
			)
		}
		this.selectTab(index)
		return this.selectStateValue(v => v.tab.tabs[index].id)
	}

	createSolutionEditorTab(
		solutionID: string,
		problemID: string,
		{ reuseTab = true, ...options }: CreateSolutionEditorTabOptions,
	) {
		const index = reuseTab
			? this.selectStateValue(selectSolutionEditorTabIndex(solutionID))
			: -1
		if (index === -1) {
			return this.createTab(
				"solution-editor",
				{
					problemID,
					solutionID,
				},
				options,
			)
		}
		this.selectTab(index)
		return this.selectStateValue(v => v.tab.tabs[index].id)
	}

	renameTab(index: number, title: string) {
		log.trace(`rename tab${index} to ${title}`)
		this.dispatch(tabActions.rename({ index, title }))
	}

	closeTab(index: number) {
		this.dispatch(tabActions.close(index))
	}

	ready(callback: () => void) {
		if (this.isReady) {
			callback()
		}
		this.readyListener.add(callback)
	}

	invalidateClient() {
		this.queryClient.invalidateQueries()
	}
}
