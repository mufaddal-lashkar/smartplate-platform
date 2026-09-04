import { commandIntents } from "@smartplate/contracts/intents"
import { Bot, type Context } from "grammy"
import type { UserFromGetMe } from "grammy/types"
import { config } from "../config"
import { logger } from "../logger"
import { planDispatch } from "../orchestrator"
import { callCallback } from "./callback"
import { callCancel } from "./commands/cancel"
import { callHelp } from "./commands/help"
import { callMenu } from "./commands/menu"
import { callStart } from "./commands/start"
import { dispatch, run } from "./dispatcher"

export type BotContext = Context

export const createBot = (botInfo: UserFromGetMe | null = null): Bot<BotContext> => {
	const bot = new Bot<BotContext>(config.telegramToken, botInfo == null ? {} : { botInfo })

	bot.use(async (ctx, next) => {
		const startedAt = Date.now()
		await next()
		logger.info(
			{ updateId: ctx.update.update_id, chatId: ctx.chatId, elapsedMs: Date.now() - startedAt },
			"update handled",
		)
	})

	bot.command("start", callStart)
	bot.command("help", callHelp)
	bot.command("menu", callMenu)
	bot.command("cancel", callCancel)

	for (const entry of commandIntents()) {
		bot.command(entry.command, async (ctx) => {
			const chatId = requireChatId(ctx)
			await run(ctx, chatId, entry.intent, {}, `bot:cmd:${chatId}:${ctx.update.update_id}`)
		})
	}

	bot.on("message:text", config.orchestratorEnabled ? planDispatch : dispatch)
	bot.on("callback_query:data", callCallback)

	bot.catch((error) => {
		logger.error({ err: error }, "bot update error")
	})

	return bot
}

export const processUpdate = async (bot: Bot<BotContext>, update: unknown): Promise<void> => {
	if (typeof update !== "object" || update == null) return
	await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0])
}

export const verifySecret = (headers: Headers): boolean => {
	if (config.webhookSecret === "") return true
	return (headers.get("x-telegram-bot-api-secret-token") ?? "") === config.webhookSecret
}

export const requireChatId = (ctx: BotContext): number => {
	if (ctx.chatId == null) throw new Error("chat id missing on this update")
	return ctx.chatId
}
