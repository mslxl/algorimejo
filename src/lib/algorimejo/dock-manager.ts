import type { AlgorimejoEventBus } from "./algorimejo"
import { match } from "ts-pattern"
import { Observable } from "../observable"

type DockPosition = "left" | "right" | "bottom"
export class DockManager {
	constructor(private eventbus: AlgorimejoEventBus) {

	}

	private _left = new Observable<string[]>([])
	private _bottom = new Observable<string[]>([])
	private _right = new Observable<string[]>([])
	private _leftSelected = new Observable<string | null>(null)
	private _bottomSelected = new Observable<string | null>(null)
	private _rightSelected = new Observable<string | null>(null)
	get left() {
		return this._left.asRead()
	}

	get bottom() {
		return this._bottom.asRead()
	}

	get right() {
		return this._right.asRead()
	}

	get leftSelected() {
		return this._leftSelected.asRead()
	}

	get bottomSelected() {
		return this._bottomSelected.asRead()
	}

	get rightSelected() {
		return this._rightSelected.asRead()
	}

	replace(options: {
		left: string[] | undefined
		bottom: string[] | undefined
		right: string[] | undefined
	}) {
		if (options.bottom)
			this._bottom.value = options.bottom
		if (options.left)
			this._left.value = options.left
		if (options.right)
			this._right.value = options.right
	}

	addDock(position: DockPosition, key: string) {
		match(position)
			.with("left", () => {
				if (!this._left.value.includes(key)) {
					this._left.value = [...this._left.value, key]
				}
			})
			.with("right", () => {
				if (!this._right.value.includes(key)) {
					this._right.value = [...this._right.value, key]
				}
			})
			.with("bottom", () => {
				if (!this._bottom.value.includes(key)) {
					this._bottom.value = [...this._bottom.value, key]
				}
			})
			.exhaustive()
	}

	unselect(position: DockPosition) {
		match(position)
			.with("left", () => {
				this._leftSelected.value = null
			})
			.with("right", () => {
				this._rightSelected.value = null
			})
			.with("bottom", () => {
				this._bottomSelected.value = null
			})
			.exhaustive()
	}

	select(position: DockPosition | null, key: string | null) {
		match(position)
			.with("left", () => {
				this._leftSelected.value = this._left.value.includes(key!) ? key : null
			})
			.with("right", () => {
				this._rightSelected.value = this._right.value.includes(key!) ? key : null
			})
			.with("bottom", () => {
				this._bottomSelected.value = this._bottom.value.includes(key!) ? key : null
			})
			.with(null, () => {
				if (this._left.value?.includes(key!)) {
					this._leftSelected.value = key
				}
				else if (this._right.value?.includes(key!)) {
					this._rightSelected.value = key
				}
				else if (this._bottom.value?.includes(key!)) {
					this._bottomSelected.value = key
				}
			})
			.exhaustive()
	}
}
