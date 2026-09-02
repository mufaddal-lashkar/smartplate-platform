import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type PermissionRow = { permission: string; granted: boolean }

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

export const handlePermissions = {
	async list(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.userId ?? "").trim()
		if (id === "") return { text: "Tell me the user id." }
		const data = await callMain<{ items: PermissionRow[] }>(
			requireChatId(ctx),
			`/v1/users/${id}/permissions`,
		)
		if (data.items.length === 0) return { text: "No overrides set." }
		const lines = data.items.map((p) => `• ${escapeMd(p.permission)} = ${p.granted}`)
		return { text: `Overrides\n${lines.join("\n")}` }
	},

	async set(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.userId ?? "").trim()
		const permission = String(entities.permission ?? "").trim()
		if (!id || !permission) return { text: "Tell me the user id and permission name." }
		const granted = entities.granted !== false
		await callMain(
			requireChatId(ctx),
			`/v1/users/${id}/permissions/${encodeURIComponent(permission)}`,
			{
				method: "PUT",
				body: { granted },
			},
		)
		return { text: `Set ${permission} = ${granted} for ${id.slice(0, 8)}.` }
	},

	async clear(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.userId ?? "").trim()
		const permission = String(entities.permission ?? "").trim()
		if (!id || !permission) return { text: "Tell me the user id and permission name." }
		await callMain(
			requireChatId(ctx),
			`/v1/users/${id}/permissions/${encodeURIComponent(permission)}`,
			{
				method: "DELETE",
			},
		)
		return { text: `Cleared override for ${permission} on ${id.slice(0, 8)}.` }
	},
}
