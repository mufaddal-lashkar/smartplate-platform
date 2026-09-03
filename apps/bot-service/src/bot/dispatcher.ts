import { findIntent } from "@smartplate/contracts/intents"
import { callAgent } from "../agent-client"
import { errorLine, esc, italic, lines } from "../format"
import { dispatchTable } from "../handlers"
import { logger } from "../logger"
import { getSession } from "../main-client"
import { parseFallback } from "../parse-fallback"
import type { BotContext } from "./bot"
import { requireChatId } from "./bot"
import { sendReply } from "./reply"

const CONFIDENCE_FLOOR = 0.5

type AgentRole = "super_admin" | "owner" | "staff" | "ngo_admin" | "ngo_volunteer"

const flatten = (
	entities: Record<string, string | number | boolean | string[]>,
): Record<string, string> => {
	const out: Record<string, string> = {}
	for (const [key, value] of Object.entries(entities)) {
		out[key] = Array.isArray(value) ? JSON.stringify(value) : String(value)
	}
	return out
}

export const run = async (
	ctx: BotContext,
	chatId: number,
	intent: string,
	entities: Record<string, string>,
	idempotencyKey: string,
): Promise<void> => {
	const spec = findIntent(intent)
	if (spec == null) {
		await sendReply(ctx, {
			text: lines([
				esc("I didn't catch that."),
				italic("Send /menu to see what I can do, or try a clearer instruction."),
			]),
		})
		return
	}

	const missing = spec.requiredEntities.filter((field) => (entities[field] ?? "") === "")

	if (missing.length > 0 && spec.listIntent !== "") {
		await run(ctx, chatId, spec.listIntent, {}, idempotencyKey)
		return
	}

	if (missing.length > 0) {
		await sendReply(ctx, {
			text: lines([
				esc(`I need ${missing.join(" and ")} for that.`),
				italic(`Try: ${spec.example}`),
			]),
		})
		return
	}

	const handler = dispatchTable[intent]
	if (handler == null) {
		await sendReply(ctx, { text: esc("That isn't wired up yet. Send /menu.") })
		return
	}

	try {
		const reply = await handler(ctx, entities, { idempotencyKey })
		await sendReply(ctx, reply)
	} catch (error) {
		const failure = error instanceof Error ? error : new Error("unknown handler failure")
		logger.warn({ chatId, intent, error: failure.message }, "handler error")
		await sendReply(ctx, { text: errorLine(failure) })
	}
}

export const dispatch = async (ctx: BotContext): Promise<void> => {
	if (ctx.message?.text == null) return
	const text = ctx.message.text
	const chatId = requireChatId(ctx)
	const updateId = ctx.update.update_id

	const session = await getSession(chatId)
	if (session == null) {
		await sendReply(ctx, { text: esc("Send /start to link this chat first.") })
		return
	}

	const parsed = await callAgent({
		requestId: `${chatId}-${updateId}`,
		text,
		userRole: session.role as AgentRole,
		tenantType: session.tenantType,
	})

	let intent = parsed?.intent ?? "unknown"
	let entities = flatten(parsed?.entities ?? {})

	if (parsed == null || parsed.confidence < CONFIDENCE_FLOOR) {
		const fallback = parseFallback(text)
		logger.info(
			{
				chatId,
				updateId,
				primary: parsed?.intent ?? null,
				primaryConfidence: parsed?.confidence ?? null,
				fallbackIntent: fallback.intent,
			},
			"using fallback parser",
		)
		intent = fallback.intent
		entities = { ...fallback.entities, ...entities }
	}

	await run(ctx, chatId, intent, entities, `bot:msg:${chatId}:${updateId}`)
}
