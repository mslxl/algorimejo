import packageInfo from "@/../package.json"

export class AlgorimejoApp {
	public readonly name = packageInfo.name
	public readonly version = packageInfo.version
	private constructor() {}
	public static async create() {
		return new AlgorimejoApp()
	}
}
