import type { ReadObservable } from "../observable"
import type { AlgorimejoEventBus } from "./algorimejo"
import type { LucideIconName } from "@/components/lucide-icon"
import { produce } from "immer"
import { DerivedObservable, Observable } from "../observable"

export interface Tab {
	key: string
	data: unknown
}

export interface TabInstance extends Tab {
	id: string
	title: string
	icon?: LucideIconName
}

export interface CreateTabOptions {

}

export class TabManager {
	constructor(private eventbus: AlgorimejoEventBus) {
	}

	private _tabs = new Observable<TabInstance[]>([])
	private _selectedID = new Observable<string | null>(null)
	/**
	 * -1 means no tab is selected
	 */
	public selectedIndex = DerivedObservable.derive(() => {
		return this.tabs.value.findIndex(tab => tab.id === this._selectedID.value)
	})

	public selectedTab = DerivedObservable.derive<TabInstance | null>(() => {
		return this.tabs.value[this.selectedIndex.value] ?? null
	})

	get tabs(): ReadObservable<TabInstance[]> {
		return this._tabs.asRead()
	}

	/**
	 * `openTab` will select the new tab, while `addTab` not
	 * @param instance
	 */
	openTab(instance: TabInstance) {
		this.addTab(instance)
		this.selectTabByID(instance.id)
	}

	addTab(instance: TabInstance) {
		this._tabs.value = [...this._tabs.value, instance]
		this.eventbus.emit("tabOpened", { key: instance.key, tabID: instance.id, data: instance.data })
	}

	exists(id: string): boolean {
		return this._tabs.value.some(tab => tab.id === id)
	}

	selectTabByID(id: string) {
		if (!this.exists(id)) {
			throw new Error(`Tab with id ${id} does not exist`)
		}
		const tab = this._tabs.value.find(tab => tab.id === id)!
		this._selectedID.value = id
		this.eventbus.emit("tabSelected", {
			tabID: tab.id,
			key: tab.key,
			data: tab.data,
		})
	}

	selectTabByIndex(index: number) {
		if (index < 0 || index >= this._tabs.value.length) {
			throw new Error(`Tab index ${index} is out of bounds`)
		}
		const tabToBeSelected = this._tabs.value[index]
		this.selectTabByID(tabToBeSelected.id)
	}

	removeTabByID(id: string) {
		if (!this.exists(id)) {
			throw new Error(`Tab with id ${id} does not exist`)
		}
		const tab = this._tabs.value.find(tab => tab.id === id)!
		this._tabs.value = this._tabs.value.filter(tab => tab.id !== id)
		this.eventbus.emit("tabClosed", {
			tabID: tab.id,
			key: tab.key,
			data: tab.data,
		})
	}

	removeTabByIndex(index: number) {
		if (index < 0 || index >= this._tabs.value.length) {
			throw new Error(`Tab index ${index} is out of bounds`)
		}
		const tab = this._tabs.value[index]
		this.removeTabByID(tab.id)
	}

	renameTab(id: string, newTitle: string) {
		if (!this.exists(id)) {
			throw new Error(`Tab with id ${id} does not exist`)
		}
		this._tabs.value = produce(this._tabs.value, (draft) => {
			draft.find(tab => tab.id === id)!.title = newTitle
		})
	}

	changeTabIcon(id: string, newIcon: LucideIconName) {
		if (!this.exists(id)) {
			throw new Error(`Tab with id ${id} does not exist`)
		}
		this._tabs.value = produce(this._tabs.value, (draft) => {
			draft.find(tab => tab.id === id)!.icon = newIcon
		})
	}

	findTabByData(options: {
		key: string | undefined
		predicate: (data: unknown) => boolean
	}): TabInstance | null {
		const tabs = options.key
			? this._tabs.value.filter(t => t.key === options.key)
			: this._tabs.value
		const tab = tabs.find(t => options.predicate(t.data))
		return tab ?? null
	}
}
