import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { bold, empty, esc, lines, money, percent, truncate } from "../format"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

const SERIES_LIMIT = 14
const DISH_LIMIT = 10

type Dashboard = {
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

type WasteBucket = { bucket: string; wasteKg: number; kgCo2eAvoided: number }
type RecoveryBucket = { bucket: string; recoveredKg: number; leftoverKg: number }
type DishRow = { dishName: string; wasteKg: number; recoveredKg: number }
type Forecast = { dishId: string; dishName: string; predictedQty: number; confidence: number }

const range = (entities: Record<string, string>): string => {
	const params: string[] = []
	if ((entities.from ?? "") !== "") params.push(`from=${entities.from}`)
	if ((entities.to ?? "") !== "") params.push(`to=${entities.to}`)
	return params.length === 0 ? "" : `?${params.join("&")}`
}

export const handleAnalytics = {
	async dashboard(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<Dashboard>(requireChatId(ctx), `/v1/dashboard${range(entities)}`)
		return {
			text: lines([
				bold("How you're doing"),
				"",
				`♻️ Recovery rate — ${percent(data.recoveryRate)}`,
				`🗑 Waste rate — ${percent(data.wasteRate)}`,
				`📦 Surplus rate — ${percent(data.surplusRate)}`,
				"",
				`💰 Value recovered — ${money(data.valueRecovered)}`,
				`🛟 Loss avoided — ${money(data.lossAvoided)}`,
				`🌍 Diverted — ${data.kgDiverted} kg`,
				"",
				esc(`${data.pendingLeftovers} leftover(s) pending · ${data.openListings} listing(s) open`),
			]),
		}
	},

	async waste(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ series: WasteBucket[] }>(
			requireChatId(ctx),
			`/v1/analytics/waste${range(entities)}`,
		)
		if (data.series.length === 0) return { text: empty("No waste recorded in that period.", "") }
		const rows = data.series.map(
			(bucket) => `${esc(bucket.bucket)} — ${bucket.wasteKg} kg (${bucket.kgCo2eAvoided} kg CO₂e)`,
		)
		return {
			text: lines([bold("Waste by day"), truncate(rows, SERIES_LIMIT, "the dashboard")]),
		}
	},

	async recovery(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ series: RecoveryBucket[] }>(
			requireChatId(ctx),
			`/v1/analytics/recovery${range(entities)}`,
		)
		if (data.series.length === 0) return { text: empty("No recovery data for that period.", "") }
		const rows = data.series.map(
			(bucket) =>
				`${esc(bucket.bucket)} — ${bucket.recoveredKg} kg of ${bucket.leftoverKg} kg recovered`,
		)
		return {
			text: lines([bold("Recovery by day"), truncate(rows, SERIES_LIMIT, "the dashboard")]),
		}
	},

	async dishes(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ dishes: DishRow[] }>(
			requireChatId(ctx),
			`/v1/analytics/dishes${range(entities)}`,
		)
		if (data.dishes.length === 0) return { text: empty("No dish analytics yet.", "") }
		const rows = data.dishes.map(
			(dish) => `${esc(dish.dishName)} — ${dish.wasteKg} kg wasted, ${dish.recoveredKg} kg saved`,
		)
		return {
			text: lines([bold("Dish performance"), truncate(rows, DISH_LIMIT, "the dashboard")]),
		}
	},

	async forecasts(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ forecasts: Forecast[] }>(
			requireChatId(ctx),
			`/v1/forecasts${range(entities)}`,
		)
		if (data.forecasts.length === 0) {
			return { text: empty("No forecasts yet.", "They build up from your prep history.") }
		}
		const rows = data.forecasts.map(
			(forecast) =>
				`${esc(forecast.dishName)} — ${forecast.predictedQty} (${percent(forecast.confidence)} confident)`,
		)
		return {
			text: lines([bold("Tomorrow's forecast"), truncate(rows, DISH_LIMIT, "the dashboard")]),
		}
	},
}
