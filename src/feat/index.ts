// TODO: use plugin archtecture
export async function loadFeatures() {
	await Promise.all([import("./file-browser"), import("./testcase"), import("./terminal"), import("./about")])
}

// TODO: use plugin archtecture
export async function loadServices() {
	await Promise.all([
		(await import("./editor/backup")).initBackupService(),
		(await import("./wakatime/wakatime")).initWakatimeService(),
	])
}
