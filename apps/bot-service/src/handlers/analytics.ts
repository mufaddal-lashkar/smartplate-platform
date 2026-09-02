import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

const todayIso = () => {
	const d = new Date()
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const defaultRange = (entities: Record<string, unknown>) => {
	const from = String(entities.from ?? "")
	const to = String(entities.to ?? "")
	const fromQ = from ? `from=${from}` : ""
	const toQ = to ? `to=${to}` : ""
	return `${fromQ ? "?" : ""}${fromQ}${fromQ && toQ ? "&" : ""}${toQ}`
}

export const handleAnalytics = {
	async dashboard(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ summary: Record<string, unknown> }>(
			requireChatId(ctx),
			"/v1/analytics/dashboard",
		)
		const lines = Object.entries(data.summary).map(([k, v]) => `• ${k}: ${v}`)
		return { text: `*Dashboard*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async waste(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const range = defaultRange(entities)
		const data = await callMain<{ items: Array<{ date: string; kg: number }> }>(
			requireChatId(ctx),
			`/v1/analytics/waste${range}`,
		)
		if (data.items.length === 0) return { text: "No waste data for that period." }
		const lines = data.items.map((w) => `• ${w.date}: ${w.kg} kg`)
		return { text: `*Waste*\n${lines.slice(0, 30).join("\n")}`, parseMode: "MarkdownV2" }
	},

	async recovery(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const range = defaultRange(entities)
		const data = await callMain<{ items: Array<{ date: string; recovered: number }> }>(
			requireChatId(ctx),
			`/v1/analytics/recovery${range}`,
		)
		if (data.items.length === 0) return { text: "No recovery data for that period." }
		const lines = data.items.map((r) => `• ${r.date}: ${r.recovered}`)
		return { text: `*Recovery*\n${lines.slice(0, 30).join("\n")}`, parseMode: "MarkdownV2" }
	},

	async dishes(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: Array<{ dishId: string; dishName: string; kg: number }> }>(
			requireChatId(ctx),
			`/v1/analytics/dishes?from=&to=`,
		)
		if (data.items.length === 0) return { text: "No dish analytics yet." }
		const lines = data.items.map((d) => `• ${d.dishName}: ${d.kg} kg`)
		return { text: `*Dish waste*\n${lines.slice(0, 20).join("\n")}`, parseMode: "MarkdownV2" }
	},

	async forecasts(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const target = todayIso()
		const data = await callMain<{ items: Array<{ date: string; predicted: number }> }>(
			requireChatId(ctx),
			`/v1/analytics/forecasts?targetDate=${target}&from=&to=`,
		)
		if (data.items.length === 0) return { text: "No forecasts yet." }
		const lines = data.items.map((f) => `• ${f.date}: ${f.predicted}`)
		return { text: `*Forecasts*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},
}
