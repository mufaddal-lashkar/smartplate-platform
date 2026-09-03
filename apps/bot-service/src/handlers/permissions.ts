import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { empty, esc, heading, lines } from "../format"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type PermissionRow = { permission: string; granted: boolean }

export const handlePermissions = {
	async list(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const userId = (entities.userId ?? "").trim()
		const data = await callMain<{ items: PermissionRow[] }>(
			requireChatId(ctx),
			`/v1/users/${userId}/permissions`,
		)
		if (data.items.length === 0) {
			return {
				text: empty("No overrides — this person has their role's defaults.", ""),
			}
		}
		const rows = data.items.map((item) => `${item.granted ? "✅" : "🚫"} ${esc(item.permission)}`)
		return { text: lines([heading("Permission overrides", data.items.length), ...rows]) }
	},

	async set(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const userId = (entities.userId ?? "").trim()
		const permission = (entities.permission ?? "").trim()
		const granted = entities.granted !== "false"
		await callMain(
			requireChatId(ctx),
			`/v1/users/${userId}/permissions/${encodeURIComponent(permission)}`,
			{ method: "PUT", body: { granted } },
		)
		return { text: `✅ ${esc(permission)} is now ${granted ? "granted" : "denied"}.` }
	},

	async clear(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const userId = (entities.userId ?? "").trim()
		const permission = (entities.permission ?? "").trim()
		await callMain(
			requireChatId(ctx),
			`/v1/users/${userId}/permissions/${encodeURIComponent(permission)}`,
			{ method: "DELETE" },
		)
		return { text: `✅ ${esc(permission)} is back to the role default.` }
	},
}
