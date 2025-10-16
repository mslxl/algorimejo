import { computed, effect, effectScope, signal } from "alien-signals"
import { useSyncExternalStore } from "react"
import { Disposable } from "./algorimejo/disposable"

type Observer<T> = (value: T) => void

export interface ReadObservable<T> {
	subscribe: (observer: Observer<T>) => Disposable
	get value(): T
}

export interface WriteObservable<T> extends ReadObservable<T> {
	set value(value: T)
}

/**
 * A simple observable implementation.
 * Not efficient for large number of observers.
 *
 * Need to be replaced by something more efficient in the future.
 */
export class Observable<T> implements ReadObservable<T> {
	private _value: { (): T, (value: T): void }
	constructor(value: T) {
		this._value = signal(value)
	}

	get value() {
		return this._value()
	}

	set value(newValue: T) {
		this._value(newValue)
	}

	subscribe(observer: Observer<T>): Disposable {
		const stopScope = effectScope(() => {
			effect(() => {
				observer(this._value())
			})
		})
		return new Disposable(() => {
			stopScope()
		})
	}

	asRead(): ReadObservable<T> {
		return this
	}
}

export class DerivedObservable<T> implements ReadObservable<T> {
	private _value: () => T
	private constructor(compute: () => T) {
		this._value = computed(() => compute())
	}

	static derive<T>(compute: () => T): ReadObservable<T> {
		return new DerivedObservable(compute)
	}

	get value(): T {
		return this._value()
	}

	subscribe(observer: Observer<T>): Disposable {
		const stopScope = effectScope(() => {
			effect(() => {
				observer(this._value())
			})
		})
		return new Disposable(() => {
			stopScope()
		})
	}
}

export function useObservable<T>(observable: ReadObservable<T>): T {
	const value = useSyncExternalStore((onStoreChange) => {
		const disposable = observable.subscribe(() => {
			onStoreChange()
		})
		return () => disposable.dispose()
	}, () => observable.value)
	return value
}
