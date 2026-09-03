import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { redis } from "../db"
import { bold, empty, esc, heading, italic, lines } from "../format"
import { callMain, getSession, unbindChat } from "../main-client"
import type { DispatchContext } from "./index"

type MeResponse = {
	user: { id: string; name: string; email: string; role: string }
	tenant: { id: string; name: string; type: string; verified: boolean }
	permissions: string[]
}

type SessionRow = { family: string; role: string; tenantId: string; issuedAt: number }

export const handleAuth = {
	async me(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<MeResponse>(requireChatId(ctx), "/v1/auth/me")
		return {
			text: lines([
				bold(data.user.name),
				esc(data.user.email),
				"",
				`Role — ${esc(data.user.role)}`,
				`Organisation — ${esc(data.tenant.name)} (${esc(data.tenant.type)}${data.tenant.verified ? ", verified" : ""})`,
				`Permissions — ${data.permissions.length}`,
			]),
		}
	},

	async logout(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const existing = await getSession(chatId)
		if (existing != null) {
			await redis.srem(`bot:tenant:${existing.tenantId}:chats`, String(chatId))
		}
		await unbindChat(chatId)
		return {
			text: lines([
				esc("You're unlinked."),
				italic("Send /start to pick a persona and sign back in."),
			]),
		}
	},

	async sessionsList(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ sessions: SessionRow[] }>(requireChatId(ctx), "/v1/sessions")
		if (data.sessions.length === 0) return { text: empty("No active sessions.", "") }
		const rows = data.sessions.map(
			(session) => `${esc(session.family.slice(0, 8))} — ${esc(session.role)}`,
		)
		return { text: lines([heading("Active sessions", data.sessions.length), ...rows]) }
	},

	async sessionsRevoke(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const family = (entities.family ?? "").trim()
		await callMain(requireChatId(ctx), `/v1/sessions/${encodeURIComponent(family)}`, {
			method: "DELETE",
		})
		return { text: esc(`Revoked session ${family.slice(0, 8)}.`) }
	},
}
