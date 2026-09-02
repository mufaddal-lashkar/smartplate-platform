import type { SessionContext } from "../../db/tx"
import { DEFAULT_METHOD_SLUG, emissionFactorFor } from "../../shared/carbon"
import type { Clock } from "../../shared/clock"
import type { DateGrain } from "../../shared/date-grain"
import {
	type DateRange,
	type DishRecovery,
	loadDashboardTotals,
	loadDishRecovery,
	loadForecasts,
	loadRecoverySeries,
	loadWasteSeries,
	type RecoveryBucket,
	type WasteBucket,
} from "./analytics.queries"
import { kgPerUnit } from "./helpers/kg-per-unit"
import { type OutcomeRow, ratio, recoveredQty } from "./helpers/recovery-math"

export type { DateGrain }

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
const DEFAULT_DISH_CATEGORY = "cereals"

const round = (value: number, places: number): number => {
	const factor = 10 ** places
	return Math.round(value * factor) / factor
}

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
			recoveredKg += recoveredQty(row as OutcomeRow) * perUnit
			binnedKg += row.binned * perUnit
		} else {
			unconvertibleQty += row.leftover
		}
		reusedValue += row.reused * row.costPerUnit
		lossAvoided += recoveredQty(row as OutcomeRow) * row.costPerUnit
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

export type WasteResponse = {
	series: (WasteBucket & {
		kgCo2eAvoided: number
		kgCo2eAvoidedMethod: string
	})[]
}

export const getWaste = async (
	ctx: SessionContext,
	range: DateRange,
	grain: DateGrain,
): Promise<WasteResponse> => {
	const series = await loadWasteSeries(ctx, range, grain)
	const factor = await emissionFactorFor(DEFAULT_DISH_CATEGORY)
	const method = factor?.method ?? DEFAULT_METHOD_SLUG
	const factorValue = factor?.kgCo2ePerKg ?? 0
	return {
		series: series.map((row) => ({
			...row,
			kgCo2eAvoided: round(row.wasteKg * factorValue, 3),
			kgCo2eAvoidedMethod: method,
		})),
	}
}

export type RecoveryResponse = {
	series: (RecoveryBucket & {
		kgCo2eAvoided: number
		kgCo2eAvoidedMethod: string
	})[]
}

export const getRecovery = async (
	ctx: SessionContext,
	range: DateRange,
	grain: DateGrain,
): Promise<RecoveryResponse> => {
	const series = await loadRecoverySeries(ctx, range, grain)
	const factor = await emissionFactorFor(DEFAULT_DISH_CATEGORY)
	const method = factor?.method ?? DEFAULT_METHOD_SLUG
	const factorValue = factor?.kgCo2ePerKg ?? 0
	return {
		series: series.map((row) => ({
			...row,
			kgCo2eAvoided: round(row.totalRecoveredKg * factorValue, 3),
			kgCo2eAvoidedMethod: method,
		})),
	}
}

export type DishesResponse = {
	dishes: (DishRecovery & {
		kgCo2eAvoided: number
		kgCo2eAvoidedMethod: string
	})[]
}

export const getDishes = async (ctx: SessionContext, range: DateRange): Promise<DishesResponse> => {
	const rows = await loadDishRecovery(ctx, range)
	const factor = await emissionFactorFor(DEFAULT_DISH_CATEGORY)
	const method = factor?.method ?? DEFAULT_METHOD_SLUG
	const factorValue = factor?.kgCo2ePerKg ?? 0
	return {
		dishes: rows.map((row) => {
			const recoveredKg = row.reusedKg + row.soldKg + row.donatedKg
			return {
				...row,
				kgCo2eAvoided: round(recoveredKg * factorValue, 3),
				kgCo2eAvoidedMethod: method,
			}
		}),
	}
}

export type ForecastsResponse = {
	forecasts: {
		dishId: string
		dishName: string
		predictedQty: number
		confidence: number
		source: string
	}[]
}

export const getForecasts = async (
	ctx: SessionContext,
	range: DateRange,
): Promise<ForecastsResponse> => {
	const forecasts = await loadForecasts(ctx, range)
	return { forecasts }
}

export type ReportTable = {
	title: string
	headers: string[]
	rows: string[][]
}

export const buildReportTable = async (
	ctx: SessionContext,
	reportType: "waste" | "recovery" | "dishes",
	range: DateRange,
): Promise<ReportTable> => {
	if (reportType === "waste") {
		const { series } = await getWaste(ctx, range, "day")
		return {
			title: "Waste report",
			headers: ["Bucket", "Surplus (kg)", "Waste (kg)", "kgCO2e avoided", "Method"],
			rows: series.map((row) => [
				row.bucket,
				row.surplusKg.toFixed(3),
				row.wasteKg.toFixed(3),
				row.kgCo2eAvoided.toFixed(3),
				row.kgCo2eAvoidedMethod,
			]),
		}
	}
	if (reportType === "recovery") {
		const { series } = await getRecovery(ctx, range, "day")
		return {
			title: "Recovery report",
			headers: [
				"Bucket",
				"Reused (kg)",
				"Sold (kg)",
				"Donated (kg)",
				"Total recovered (kg)",
				"Recovery rate",
				"kgCO2e avoided",
				"Method",
			],
			rows: series.map((row) => [
				row.bucket,
				row.reusedKg.toFixed(3),
				row.soldKg.toFixed(3),
				row.donatedKg.toFixed(3),
				row.totalRecoveredKg.toFixed(3),
				row.recoveryRate.toFixed(4),
				row.kgCo2eAvoided.toFixed(3),
				row.kgCo2eAvoidedMethod,
			]),
		}
	}
	const { dishes } = await getDishes(ctx, range)
	return {
		title: "Per-dish recovery report",
		headers: [
			"Dish",
			"Prepared (kg)",
			"Leftover (kg)",
			"Reused (kg)",
			"Sold (kg)",
			"Donated (kg)",
			"Wasted (kg)",
			"Recovery rate",
			"kgCO2e avoided",
			"Method",
		],
		rows: dishes.map((row) => [
			row.name,
			row.preparedKg.toFixed(3),
			row.leftoverKg.toFixed(3),
			row.reusedKg.toFixed(3),
			row.soldKg.toFixed(3),
			row.donatedKg.toFixed(3),
			row.wastedKg.toFixed(3),
			row.recoveryRate.toFixed(4),
			row.kgCo2eAvoided.toFixed(3),
			row.kgCo2eAvoidedMethod,
		]),
	}
}
