import { useReducer } from "react"
import { PrefItemsContext, PrefItemsDispatchContext, prefsDispatcher } from "./context"

interface PrefsProviderProps {
	children: React.ReactNode
}

export function PrefsProvider({ children }: PrefsProviderProps) {
	const [items, dispatch] = useReducer(prefsDispatcher, [])

	return (
		<PrefItemsContext.Provider value={items}>
			<PrefItemsDispatchContext.Provider value={dispatch}>
				{children}
			</PrefItemsDispatchContext.Provider>
		</PrefItemsContext.Provider>
	)
}
