import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type Preference = {
	topic: string
	radiusKm: number | null
	activeFrom: string
	activeTo: string
	quietHoursEnabled: boolean
}

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

export const handleNotifications = {
	async get(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ preferences: Preference[] }>(
			requireChatId(ctx),
			"/v1/notification-preferences",
		)
		if (data.preferences.length === 0) return { text: "No preferences set." }
		const lines = data.preferences.map(
			(p) =>
				`• ${escapeMd(p.topic)} — radius ${p.radiusKm ?? "—"} km, ${p.activeFrom}–${p.activeTo}, quiet: ${p.quietHoursEnabled ? "on" : "off"}`,
		)
		return { text: `*Notification preferences*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async set(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const list = Array.isArray(entities.preferences) ? entities.preferences : null
		if (list == null || list.length === 0) {
			return { text: "Tell me at least one preference with topic, active hours, and radius." }
		}
		const preferences = list.map((raw) => {
			const p = raw as Record<string, unknown>
			return {
				topic: String(p.topic ?? ""),
				radiusKm: p.radiusKm == null ? null : Number(p.radiusKm),
				activeFrom: String(p.activeFrom ?? "00:00"),
				activeTo: String(p.activeTo ?? "23:59"),
				quietHoursEnabled: p.quietHoursEnabled === true,
			}
		})
		await callMain(requireChatId(ctx), "/v1/notification-preferences", {
			method: "PUT",
			body: { preferences },
		})
		return { text: `Saved ${preferences.length} preference(s).` }
	},
}
