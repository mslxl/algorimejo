import type { Dispatch } from "react"
import { createContext, useContext } from "react"

export interface PrefItem {
	section: string
	name: string
	description: string
	component: HTMLElement
}

export const PrefItemsContext = createContext<PrefItem[] | null>(null)
export const PrefItemsDispatchContext = createContext<Dispatch<PrefsDispatcherAction> | null>(null)

export const PrefSectionContext = createContext<string | null>(null)

export function usePrefItems() {
	return useContext(PrefItemsContext)
}

export function usePrefItemsDispatch() {
	return useContext(PrefItemsDispatchContext)
}

interface PrefsDispatcherAction {
	type: "add" | "remove"
	item: PrefItem
}

export function prefsDispatcher(items: PrefItem[], action: PrefsDispatcherAction) {
	switch (action.type) {
		case "add":
			return [...items, action.item]
		case "remove":
			return items.filter(item => item.name !== action.item.name)
	}
}
