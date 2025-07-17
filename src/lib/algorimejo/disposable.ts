export class Disposable {
	private disposed = false;
	constructor(private readonly callOnDispose: () => void) {}
	static from(...disposables: Disposable[]): Disposable {
		return new Disposable(() => {
			disposables.forEach((d) => d.dispose());
		});
	}

	dispose() {
		if (this.disposed) return;
		this.callOnDispose();
		this.disposed = true;
	}
}
