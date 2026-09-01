import { CircleCheckIcon, ShieldAlertIcon } from "lucide-react"
import { Badge } from "./ui/badge"

export const reliabilityPercent = (claimed: number, noShows: number): number => {
	if (claimed === 0) return 100
	return Math.round((1 - noShows / claimed) * 100)
}

export const ReliabilityBadge = ({ claimed, noShows }: { claimed: number; noShows: number }) => {
	const pct = reliabilityPercent(claimed, noShows)
	if (pct >= 90) {
		return (
			<Badge variant="good">
				<CircleCheckIcon /> {pct}% reliable · {claimed} pickup{claimed === 1 ? "" : "s"}
			</Badge>
		)
	}
	return (
		<Badge variant="warning">
			<ShieldAlertIcon /> {pct}% reliable · {noShows} no-show
			{noShows === 1 ? "" : "s"}
		</Badge>
	)
}
