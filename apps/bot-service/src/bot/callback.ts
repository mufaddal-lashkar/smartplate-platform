import { callAgent } from "../agent-client"
import { dispatchIntent } from "../handlers"
import { logger } from "../logger"
import { getSession } from "../main-client"
import { parseFallback } from "../parse-fallback"
import type { BotContext } from "./bot"
import { requireChatId } from "./bot"
import { editReply, type Reply, sendReply } from "./reply"

export const callCallback = async (ctx: BotContext): Promise<void> => {
	const data = ctx.callbackQuery?.data
	if (data == null) return
	const chatId = requireChatId(ctx)

	if (data === "noop") {
		await ctx.answerCallbackQuery({ text: "Already handled." })
		return
	}

	const session = await getSession(chatId)
	if (session == null) {
		await ctx.answerCallbackQuery({ text: "Not linked." })
		return
	}

	const actionMatch = data.match(/^act:([a-z_.]+)$/)
	if (actionMatch != null) {
		const intent = actionMatch[1]
		const requestId = `${chatId}-cb-${ctx.update.update_id}`
		const parsed = await callAgent({
			requestId,
			text: intent,
			userRole: session.role as "super_admin" | "owner" | "staff" | "ngo_admin" | "ngo_volunteer",
			tenantType: session.tenantType,
		})
		const intent_name = parsed?.intent ?? parseFallback(intent).intent
		const entities = parsed?.entities ?? {}
		try {
			const reply: Reply = await dispatchIntent(ctx, intent_name, entities, {
				idempotencyKey: `bot:cb:${ctx.update.update_id}`,
			})
			if (ctx.callbackQuery?.message?.message_id != null) {
				await editReply(ctx, ctx.callbackQuery.message.message_id, reply)
			} else {
				await sendReply(ctx, reply)
			}
			await ctx.answerCallbackQuery()
		} catch (error) {
			const message = error instanceof Error ? error.message : "Handler failed."
			logger.warn({ chatId, intent, error: message }, "callback handler error")
			await ctx.answerCallbackQuery({ text: message, show_alert: true })
		}
		return
	}

	await ctx.answerCallbackQuery({ text: "Unknown action." })
}
