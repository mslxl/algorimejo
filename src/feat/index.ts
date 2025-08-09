export async function loadFeatures() {
	await Promise.all([import("./file-browser"), import("./testcase")])
}
