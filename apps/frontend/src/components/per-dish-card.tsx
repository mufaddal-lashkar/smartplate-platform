import { cn } from "../lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

export type DishRecovery = {
	dishId: string
	name: string
	preparedKg: number
	leftoverKg: number
	reusedKg: number
	soldKg: number
	donatedKg: number
	wastedKg: number
	recoveryRate: number
	kgCo2eAvoided: number
	kgCo2eAvoidedMethod: string
}

const kg = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })

const asPercent = (fraction: number): string => `${Math.round(fraction * 100)}%`

const toneFor = (rate: number): string => {
	if (rate >= 0.8) return "text-good"
	if (rate >= 0.5) return "text-warning"
	return "text-serious"
}

export const PerDishCard = ({ dish }: { dish: DishRecovery }) => (
	<Card>
		<CardHeader>
			<div className="flex items-baseline justify-between gap-2">
				<CardTitle className="text-base">{dish.name}</CardTitle>
				<span className={cn("font-display text-xl tabular", toneFor(dish.recoveryRate))}>
					{asPercent(dish.recoveryRate)}
				</span>
			</div>
		</CardHeader>
		<CardContent className="space-y-3">
			<dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
				<dt className="text-muted-foreground">Prepared</dt>
				<dd className="text-right tabular">{kg.format(dish.preparedKg)} kg</dd>
				<dt className="text-muted-foreground">Leftover</dt>
				<dd className="text-right tabular">{kg.format(dish.leftoverKg)} kg</dd>
				<dt className="text-muted-foreground">Reused</dt>
				<dd className="text-right tabular text-good">{kg.format(dish.reusedKg)} kg</dd>
				<dt className="text-muted-foreground">Sold</dt>
				<dd className="text-right tabular text-good">{kg.format(dish.soldKg)} kg</dd>
				<dt className="text-muted-foreground">Donated</dt>
				<dd className="text-right tabular text-good">{kg.format(dish.donatedKg)} kg</dd>
				<dt className="text-muted-foreground">Wasted</dt>
				<dd className="text-right tabular text-serious">{kg.format(dish.wastedKg)} kg</dd>
			</dl>
			<p className="text-xs text-muted-foreground">
				CO₂e avoided:{" "}
				<span className="tabular text-foreground">{kg.format(dish.kgCo2eAvoided)} kg</span> via{" "}
				{dish.kgCo2eAvoidedMethod}.
			</p>
		</CardContent>
	</Card>
)
