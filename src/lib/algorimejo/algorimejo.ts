import type { FC } from "react"
import type { AlgorimejoEvents } from "./events"
import { QueryClient } from "@tanstack/react-query"
import * as log from "@tauri-apps/plugin-log"
import { uniqueId } from "lodash/fp"
import mitt from "mitt"
import { SolutionEditor } from "@/feat/editor/editor"
import { solutionEditorPageDataSchema } from "@/feat/editor/schema"
import { ProgramPreference } from "@/feat/program-pref"
import { WorkspacePreference } from "@/feat/workspace-pref"
import { AlgorimejoApp } from "./app"
import { DockManager } from "./dock-manager"
import { TabManager } from "./tab-manager"

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

export type AlgorimejoEventBus = ReturnType<typeof mitt<AlgorimejoEvents>>
/**
 * The main class of Algorimejo
 * It is a singleton class that manages the state of the application
 *
 * Do not instantiate this class directly, use the `algorimejo` instance instead
 * You can use `algorimejo.ready(callback)` to wait for the instance to be ready
 */
export class Algorimejo {
	private _app?: AlgorimejoApp
	public readonly events: AlgorimejoEventBus = mitt<AlgorimejoEvents>()
	public readonly dock = new DockManager(this.events)
	public readonly tab = new TabManager(this.events)

	private _queryClient = new QueryClient()

	private panels = new Map<string, PanelAttrs>()
	private ui = new Map<string, FC<MainUIProps>>()

	private isReady = false

	get app(): AlgorimejoApp {
		if (!this.isReady || !this._app) {
			throw new Error("app is not ready")
		}
		return this._app
	}

	constructor() {
		// event log
		this.events.on("*", (tag, payload) => {
			log.trace(`event "${tag}" emitted with payload: ${JSON.stringify(payload)}`)
		});

		(async () => {
			this.provideUI("solution-editor", SolutionEditor)
			this.provideUI("workspace-pref", WorkspacePreference)
			this.provideUI("program-pref", ProgramPreference)
			await Promise.all([
				AlgorimejoApp.create().then((app) => {
					this._app = app
				}),
			])
		})().then(() => {
			this.events.emit("ready")
			this.isReady = true
		})
	}

	get queryClient() {
		return this._queryClient
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

	openWorkspacePrefTab() {
		this.tab.openTab({
			id: uniqueId("tab-"),
			key: "workspace-pref",
			title: "Workspace Preferences",
			icon: "LucideColumnsSettings",
			data: {},
		})
	}

	openProgramPrefTab() {
		this.tab.openTab({
			id: uniqueId("tab-"),
			key: "program-pref",
			title: "Program Preferences",
			icon: "LucideSettings2",
			data: {},
		})
	}

	findSolutionTabID(solutionID: string): string | null {
		return this.tab.findTabByData({
			key: "solution-editor",
			predicate: (data) => {
				const result = solutionEditorPageDataSchema.safeParse(data)
				return result.success && result.data.solutionID === solutionID
			},
		})?.id ?? null
	}

	openSolutionTab(options: {
		problemID: string
		solutionID: string
		reuse?: boolean
		language?: string
		title: string
	}) {
		const existedTab = this.findSolutionTabID(options.solutionID)
		if (options.reuse && existedTab) {
			this.tab.selectTabByID(existedTab)
			return
		}
		const tabID = uniqueId("tab-")
		this.tab.openTab({
			id: tabID,
			key: "solution-editor",
			data: {
				problemID: options.problemID,
				solutionID: options.solutionID,
			},
			title: options.title,
		})
	}

	ready(callback: () => void) {
		if (this.isReady) {
			callback()
		}
		this.events.on("ready", callback)
	}

	invalidateClient() {
		this.queryClient.invalidateQueries()
	}
}
