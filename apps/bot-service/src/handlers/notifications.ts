import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { empty, esc, heading, lines } from "../format"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type Preference = {
	topic: string
	radiusKm: number | null
	activeFrom: string
	activeTo: string
	quietHoursEnabled: boolean
}

export const handleNotifications = {
	async get(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ preferences: Preference[] }>(
			requireChatId(ctx),
			"/v1/notification-preferences",
		)
		if (data.preferences.length === 0) {
			return { text: empty("No alert preferences set — you get everything in range.", "") }
		}
		const rows = data.preferences.map(
			(pref) =>
				`${esc(pref.topic)} · ${pref.radiusKm == null ? "any distance" : `${pref.radiusKm} km`} · ${esc(pref.activeFrom)}–${esc(pref.activeTo)}${pref.quietHoursEnabled ? " · quiet hours on" : ""}`,
		)
		return { text: lines([heading("Alert preferences", data.preferences.length), ...rows]) }
	},

	async set(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const parsed = JSON.parse(entities.preferences ?? "[]") as Array<Record<string, string>>
		if (parsed.length === 0) {
			return { text: esc("Tell me a topic, a radius and the hours you want alerts.") }
		}
		const preferences = parsed.map((item) => ({
			topic: String(item.topic ?? ""),
			radiusKm: item.radiusKm == null ? null : Number(item.radiusKm),
			activeFrom: String(item.activeFrom ?? "00:00"),
			activeTo: String(item.activeTo ?? "23:59"),
			quietHoursEnabled: String(item.quietHoursEnabled ?? "") === "true",
		}))
		await callMain(requireChatId(ctx), "/v1/notification-preferences", {
			method: "PUT",
			body: { preferences },
		})
		return { text: `✅ Saved ${preferences.length} preference(s).` }
	},
}
