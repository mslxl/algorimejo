import type { MainUIProps } from "@/lib/algorimejo/algorimejo"
import { FunnyAbout } from "./funny-about"

export function About(_: MainUIProps<unknown>) {
	return (
		<div className="">
			<div className="flex">
				<FunnyAbout />
			</div>
		</div>
	)
}
