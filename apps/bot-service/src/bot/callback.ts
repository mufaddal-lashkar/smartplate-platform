import { findIntent } from "@smartplate/contracts/intents"
import { esc, lines } from "../format"
import { logger } from "../logger"
import { getSession } from "../main-client"
import { decodeCallback, encodeConfirm, readToken } from "../resolver"
import type { BotContext } from "./bot"
import { requireChatId } from "./bot"
import { bindPersona, PERSONA_PREFIX } from "./commands/start"
import { run } from "./dispatcher"
import { btn, row, sendReply } from "./reply"

export const callCallback = async (ctx: BotContext): Promise<void> => {
	const data = ctx.callbackQuery?.data
	if (data == null) return
	const chatId = requireChatId(ctx)

	if (data === "noop") {
		await ctx.answerCallbackQuery()
		return
	}

	if (data.startsWith(PERSONA_PREFIX)) {
		await ctx.answerCallbackQuery()
		await bindPersona(ctx, chatId, data.slice(PERSONA_PREFIX.length))
		return
	}

	const target = decodeCallback(data)
	if (target == null) {
		await ctx.answerCallbackQuery({ text: "I don't recognise that button." })
		return
	}

	const session = await getSession(chatId)
	if (session == null) {
		await ctx.answerCallbackQuery({ text: "Send /start to link this chat first." })
		return
	}

	const spec = findIntent(target.intent)
	if (spec == null) {
		await ctx.answerCallbackQuery({ text: "That action is no longer available." })
		return
	}

	const entities = await readToken(chatId, target.token)
	if (entities == null) {
		await ctx.answerCallbackQuery({ text: "That list is stale — pull a fresh one." })
		await sendReply(ctx, { text: esc("That list has expired. Send /menu for a fresh one.") })
		return
	}

	if (spec.destructive && target.kind === "action") {
		await ctx.answerCallbackQuery()
		const label = spec.buttonLabel === "" ? "That action" : spec.buttonLabel
		await sendReply(ctx, {
			text: lines([esc(`${label} can't be undone.`), esc("Go ahead?")]),
			rows: [
				row([
					btn("Yes, do it", encodeConfirm(spec.intent, target.token)),
					btn("No, cancel", "noop"),
				]),
			],
		})
		return
	}

	await ctx.answerCallbackQuery()
	logger.info({ chatId, intent: spec.intent, kind: target.kind }, "callback dispatched")
	await run(ctx, chatId, spec.intent, entities, `bot:cb:${chatId}:${ctx.update.update_id}`)
}
