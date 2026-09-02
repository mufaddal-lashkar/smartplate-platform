import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

const todayIso = () => {
	const d = new Date()
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const oneWeekAgoIso = () => {
	const d = new Date()
	d.setDate(d.getDate() - 7)
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

type InsightResponse = {
	summary?: string
	highlights?: string[]
	recommendations?: string[]
	source: "agent" | "fallback"
}

export const handleInsights = {
	async get(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const from = String(_e.from ?? oneWeekAgoIso())
		const to = String(_e.to ?? todayIso())
		try {
			const data = await callMain<InsightResponse>(
				requireChatId(ctx),
				`/v1/insights?from=${from}&to=${to}`,
			)
			const lines: string[] = []
			if (data.summary) lines.push(data.summary)
			if (data.highlights && data.highlights.length > 0) {
				lines.push("Highlights")
				lines.push(...data.highlights.map((h) => `• ${h}`))
			}
			if (data.recommendations && data.recommendations.length > 0) {
				lines.push("Recommendations")
				lines.push(...data.recommendations.map((r) => `• ${r}`))
			}
			return {
				text: lines.length > 0 ? lines.join("\n") : "No insights for that range.",
			}
		} catch (err) {
			const status = (err as { status?: number }).status
			if (status === 503) return { text: "Insights service is offline right now. Try later." }
			return { text: "Couldn't fetch insights." }
		}
	},
}
