/**
 * Tab title of a solution editor; the first solution usually shares its problem's name, so don't repeat it
 */
export function getSolutionTabTitle(solutionName: string, problemName: string) {
	return solutionName === problemName ? problemName : `${solutionName} - ${problemName}`
}
