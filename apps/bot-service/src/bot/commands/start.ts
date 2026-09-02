import { config } from "../../config"
import { redis } from "../../db"
import { logger } from "../../logger"
import { bindChat, getSession, setTenantSession, unbindChat } from "../../main-client"
import { isValidTenantCode } from "../../parse-fallback"
import { registerTenant } from "../../sse-bridge"
import type { BotContext } from "../bot"
import { requireChatId } from "../bot"
import { sendReply } from "../reply"

export const callStart = async (ctx: BotContext): Promise<void> => {
	const chatId = requireChatId(ctx)
	const text = ctx.message?.text ?? ""
	const match = text.match(/^\/start(?:\s+(.+))?/)
	const arg = match?.[1]?.trim() ?? ""

	if (arg === "logout" || arg === "unbind") {
		const existing = await getSession(chatId)
		if (existing != null) {
			await redis.srem(`bot:tenant:${existing.tenantId}:chats`, String(chatId))
		}
		await unbindChat(chatId)
		await sendReply(ctx, {
			text: "You've been unlinked. Run /start <tenant-code> to link again.",
		})
		return
	}

	if (arg === "") {
		const existing = await getSession(chatId)
		if (existing != null) {
			await sendReply(ctx, {
				text: `You're already linked to ${existing.tenantId.slice(0, 8)} as ${existing.role}. Send /menu to see what you can do, or /start logout to unlink.`,
			})
			return
		}
		try {
			const session = await bindChat(chatId, config.defaultTenantCode, config.defaultTenantEmail)
			await setTenantSession(session.tenantId, session)
			await redis.sadd(`bot:tenant:${session.tenantId}:chats`, String(chatId))
			await registerTenant(session.tenantId)
			logger.warn(
				{ chatId, tenantId: session.tenantId, role: session.role, source: "default-bind" },
				"chat auto-bound to default tenant user",
			)
			await sendReply(ctx, {
				text: `Linked to ${config.defaultTenantCode} as ${session.role}. Send /menu to see what's available.`,
			})
		} catch (error) {
			const message = error instanceof Error ? error.message : "I couldn't link this chat."
			logger.error({ chatId, error: message }, "default-bind failed")
			await sendReply(ctx, { text: message })
		}
		return
	}

	const parts = arg.split(/\s+/)
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		await sendReply(ctx, {
			text: "Send your tenant code and email like: /spice-route asha@spiceroute.local",
		})
		return
	}

	const [tenantCode, email] = parts
	if (!isValidTenantCode(tenantCode)) {
		await sendReply(ctx, {
			text: "That tenant code doesn't look right. Use letters, digits and dashes only.",
		})
		return
	}
	if (!email.includes("@")) {
		await sendReply(ctx, {
			text: "That email doesn't look right. Try again, e.g. /spice-route asha@spiceroute.local",
		})
		return
	}

	try {
		const session = await bindChat(chatId, tenantCode, email)
		await setTenantSession(session.tenantId, session)
		await redis.sadd(`bot:tenant:${session.tenantId}:chats`, String(chatId))
		await registerTenant(session.tenantId)
		await sendReply(ctx, {
			text: `Linked to ${tenantCode} as ${session.role}. Send /menu to see what's available.`,
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "I couldn't link this chat."
		logger.warn({ chatId, error: message }, "bind failed")
		await sendReply(ctx, { text: message })
	}
}
