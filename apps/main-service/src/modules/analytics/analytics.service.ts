import type { SessionContext } from "../../db/tx"
import type { Clock } from "../../shared/clock"
import {
	type DateRange,
	type DishUnit,
	loadDashboardTotals,
	type OutcomeTotals,
} from "./analytics.queries"

export type Dashboard = {
	surplusRate: number
	wasteRate: number
	recoveryRate: number
	valueRecovered: number
	lossAvoided: number
	kgDiverted: number
	unconvertibleQty: number
	pendingLeftovers: number
	openListings: number
}

export type RangeInput = {
	from: string
	to: string
}

const DEFAULT_WINDOW_DAYS = 30
const GRAMS_PER_KG = 1000

const round = (value: number, places: number): number => {
	const factor = 10 ** places
	return Math.round(value * factor) / factor
}

const ratio = (numerator: number, denominator: number): number =>
	denominator > 0 ? round(numerator / denominator, 4) : 0

const kgPerUnit = (dish: DishUnit): number => {
	if (dish.servingUnit === "kg") return 1
	if (dish.avgServingWeightG > 0) return dish.avgServingWeightG / GRAMS_PER_KG
	return 0
}

const recoveredQty = (row: OutcomeTotals): number => row.reused + row.sold + row.donated

export const resolveRange = (input: RangeInput, clock: Clock): DateRange => {
	const to = input.to === "" ? clock.now().format("YYYY-MM-DD") : input.to
	const from =
		input.from === ""
			? clock.now().subtract(DEFAULT_WINDOW_DAYS, "day").format("YYYY-MM-DD")
			: input.from
	return { from, to }
}

export const getDashboard = async (ctx: SessionContext, range: DateRange): Promise<Dashboard> => {
	const totals = await loadDashboardTotals(ctx, range)

	let preparedKg = 0
	for (const row of totals.prepared) {
		preparedKg += row.prepared * kgPerUnit(row)
	}

	let leftoverKg = 0
	let recoveredKg = 0
	let binnedKg = 0
	let unconvertibleQty = 0
	let reusedValue = 0
	let lossAvoided = 0

	for (const row of totals.outcomes) {
		const perUnit = kgPerUnit(row)
		if (perUnit > 0) {
			leftoverKg += row.leftover * perUnit
			recoveredKg += recoveredQty(row) * perUnit
			binnedKg += row.binned * perUnit
		} else {
			unconvertibleQty += row.leftover
		}
		reusedValue += row.reused * row.costPerUnit
		lossAvoided += recoveredQty(row) * row.costPerUnit
	}

	return {
		surplusRate: ratio(leftoverKg, preparedKg),
		wasteRate: ratio(binnedKg, preparedKg),
		recoveryRate: ratio(recoveredKg, leftoverKg),
		valueRecovered: round(totals.b2bProceeds + reusedValue, 2),
		lossAvoided: round(lossAvoided, 2),
		kgDiverted: round(recoveredKg, 3),
		unconvertibleQty: round(unconvertibleQty, 3),
		pendingLeftovers: totals.pendingLeftovers,
		openListings: totals.openListings,
	}
}
