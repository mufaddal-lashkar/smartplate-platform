import { callAgent, type ParseIntentResponse } from "../agent-client"
import { redis } from "../db"
import { dispatchIntent } from "../handlers"
import { logger } from "../logger"
import { bindChat, getSession, setTenantSession } from "../main-client"
import { isValidTenantCode, parseFallback } from "../parse-fallback"
import { registerTenant } from "../sse-bridge"
import type { BotContext } from "./bot"
import { requireChatId } from "./bot"
import { type Reply, sendReply } from "./reply"

const IDEMPOTENCY_KEY = (chatId: number, updateId: number) => `bot:idem:${chatId}:${updateId}`

const askForClarification = (ctx: BotContext, needs: string[]): Promise<number | null> =>
	sendReply(ctx, {
		text: `I need a bit more. Please provide: ${needs.join(", ")}.`,
	})

const performBind = async (
	ctx: BotContext,
	chatId: number,
	tenantCode: string,
	email: string,
): Promise<void> => {
	try {
		const session = await bindChat(chatId, tenantCode, email)
		await setTenantSession(session.tenantId, session)
		await redis.sadd(`bot:tenant:${session.tenantId}:chats`, String(chatId))
		await registerTenant(session.tenantId)
		ctx.session.step = ""
		await sendReply(ctx, {
			text: `Linked to *${tenantCode}* as *${session.role}*. Send /menu to see what's available.`,
			parseMode: "MarkdownV2",
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "I couldn't link this chat."
		logger.warn({ chatId, error: message }, "bind failed")
		await sendReply(ctx, { text: message })
	}
}

export const dispatch = async (ctx: BotContext): Promise<void> => {
	if (ctx.message?.text == null) return
	const text = ctx.message.text
	const chatId = requireChatId(ctx)
	const updateId = ctx.update.update_id

	if (ctx.session.step === "awaiting_tenant_code") {
		const parts = text.trim().split(/\s+/)
		if (parts.length === 2 && parts[0] != null && parts[1] != null) {
			const [tenantCode, email] = parts
			if (isValidTenantCode(tenantCode) && email.includes("@")) {
				await performBind(ctx, chatId, tenantCode, email)
				return
			}
		}
		await sendReply(ctx, {
			text: "Send your tenant code and email like: spice-route asha@spiceroute.local",
		})
		return
	}

	const session = await getSession(chatId)
	if (session == null) {
		await sendReply(ctx, {
			text: "Link this chat first with /start <tenant-code> <email>.",
		})
		return
	}

	if (ctx.session.step.startsWith("awaiting_")) {
		await sendReply(ctx, {
			text: "I'm still waiting for the previous step. Send /cancel to abort.",
		})
		return
	}

	const requestId = `${chatId}-${updateId}`
	const parsed = await callAgent({
		requestId,
		text,
		userRole: session.role as "super_admin" | "owner" | "staff" | "ngo_admin" | "ngo_volunteer",
		tenantType: session.tenantType,
	})

	let intent = parsed?.intent ?? "unknown"
	let confidence = parsed?.confidence ?? 0
	let entities = parsed?.entities ?? {}
	let needs = parsed?.needs_clarification ?? []

	if (parsed == null || confidence < 0.5) {
		const fallback = parseFallback(text)
		logger.info(
			{
				chatId,
				updateId,
				primary: parsed?.intent ?? null,
				primaryConfidence: parsed?.confidence ?? null,
				fallbackIntent: fallback.intent,
				fallbackConfidence: fallback.confidence,
			},
			"using fallback parser",
		)
		intent = fallback.intent
		confidence = fallback.confidence
		entities = { ...fallback.entities, ...entities }
		needs = fallback.needs_clarification
	}

	if (intent === "unknown") {
		await sendReply(ctx, {
			text: "I didn't catch that. Try /menu for the full list, or write a clearer instruction.",
		})
		return
	}

	if (needs.length > 0) {
		await askForClarification(ctx, needs)
		return
	}

	const idempotencyKey = IDEMPOTENCY_KEY(chatId, updateId)
	try {
		const reply = await dispatchIntent(ctx, intent, entities, { idempotencyKey })
		await sendReply(ctx, reply)
	} catch (error) {
		const message = error instanceof Error ? error.message : "Something went wrong."
		logger.warn({ chatId, updateId, intent, error: message }, "handler error")
		await sendReply(ctx, { text: message })
	}
}

export type IntentResult = Reply

void ({} as ParseIntentResponse)
