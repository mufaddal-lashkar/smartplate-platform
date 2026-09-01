import { type DishUnit, kgPerUnit } from "./kg-per-unit"

export type OutcomeRow = DishUnit & {
	leftover: number
	reused: number
	sold: number
	donated: number
	binned: number
	costPerUnit: number
}

export const recoveredQty = (row: OutcomeRow): number => row.reused + row.sold + row.donated

export const kgPerDish = (row: OutcomeRow): number => {
	const perUnit = kgPerUnit(row)
	if (perUnit <= 0) return 0
	return row.leftover * perUnit
}

const round = (value: number, places: number): number => {
	const factor = 10 ** places
	return Math.round(value * factor) / factor
}

export const ratio = (numerator: number, denominator: number): number =>
	denominator > 0 ? round(numerator / denominator, 4) : 0

export const recoveryRate = (recovered: number, leftover: number): number =>
	ratio(recovered, leftover)
