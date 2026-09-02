import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain, unbindChat } from "../main-client"
import type { DispatchContext } from "./index"

export const handleAuth = {
	async me(
		ctx: BotContext,
		_entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{
			user: { id: string; name: string; email: string; role: string }
			tenant: { id: string; name: string; type: string; verified: boolean }
			permissions: string[]
		}>(requireChatId(ctx), "/v1/auth/me")
		return {
			text: `*${data.user.name}* (${data.user.email})\nRole: ${data.user.role}\nTenant: ${data.tenant.name} (${data.tenant.type}${data.tenant.verified ? ", verified" : ""})\nPermissions: ${data.permissions.length}`,
			parseMode: "MarkdownV2",
		}
	},

	async logout(
		ctx: BotContext,
		_entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		await unbindChat(requireChatId(ctx))
		return { text: "Unlinked. Run /start <tenant-code> <email> to link again." }
	},

	async sessionsList(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{
			sessions: Array<{
				family: string
				userId: string
				tenantId: string
				role: string
				issuedAt: number
			}>
		}>(requireChatId(ctx), "/v1/sessions")
		if (data.sessions.length === 0) return { text: "No active sessions." }
		const lines = data.sessions.map(
			(s) => `• ${s.family.slice(0, 8)} — ${s.role} @ ${s.tenantId.slice(0, 8)}`,
		)
		return { text: `*Active sessions*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async sessionsRevoke(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const family = String(entities.family ?? "").trim()
		if (family === "") return { text: "Send a session family to revoke." }
		await callMain(requireChatId(ctx), `/v1/sessions/${encodeURIComponent(family)}`, {
			method: "DELETE",
		})
		return { text: `Revoked ${family.slice(0, 8)}.` }
	},
}
