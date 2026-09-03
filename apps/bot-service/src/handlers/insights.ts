import dayjs from "dayjs"
import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { bold, empty, esc, lines } from "../format"
import { callMain, MainApiError } from "../main-client"
import type { DispatchContext } from "./index"

type InsightResponse = {
	summary: string
	highlights: string[]
	recommendations: string[]
}

export const handleInsights = {
	async get(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const from = entities.from ?? dayjs().subtract(7, "day").format("YYYY-MM-DD")
		const to = entities.to ?? dayjs().format("YYYY-MM-DD")
		try {
			const data = await callMain<InsightResponse>(
				requireChatId(ctx),
				`/v1/insights?from=${from}&to=${to}`,
			)
			const parts: string[] = [bold("What I'm seeing")]
			if ((data.summary ?? "") !== "") parts.push(esc(data.summary))
			const highlights = data.highlights ?? []
			if (highlights.length > 0) {
				parts.push("", bold("Highlights"), ...highlights.map((item) => `• ${esc(item)}`))
			}
			const recommendations = data.recommendations ?? []
			if (recommendations.length > 0) {
				parts.push("", bold("What to do"), ...recommendations.map((item) => `• ${esc(item)}`))
			}
			if (parts.length === 1) return { text: empty("No insight for that range yet.", "") }
			return { text: lines(parts) }
		} catch (error) {
			if (error instanceof MainApiError && error.code === "AI_UNAVAILABLE") {
				return {
					text: empty(
						"No AI insight for that period yet.",
						"Insights are generated from the last 7 days of activity.",
					),
				}
			}
			throw error
		}
	},
}
