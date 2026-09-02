import { Bot, type Context, type NextFunction, session } from "grammy"
import { config } from "../config"
import { logger } from "../logger"
import { callCallback } from "./callback"
import { callCancel } from "./commands/cancel"
import { callHelp } from "./commands/help"
import { callMenu } from "./commands/menu"
import { callStart } from "./commands/start"
import { callSwitch } from "./commands/switch"
import { dispatch } from "./dispatcher"

export type SessionData = {
	step: string
	pending: Record<string, string>
	lastBotMessageId: number
}

const initialSession = (): SessionData => ({
	step: "",
	pending: {},
	lastBotMessageId: 0,
})

export type BotContext = Context & { session: SessionData }

export const createBot = (): Bot<BotContext> => {
	const bot = new Bot<BotContext>(config.telegramToken)

	bot.use(
		session({
			initial: initialSession,
		}),
	)

	bot.use(async (ctx, next) => {
		const start = Date.now()
		await next()
		const ms = Date.now() - start
		logger.info(
			{
				updateId: ctx.update.update_id,
				chatId: ctx.chatId,
				elapsedMs: ms,
			},
			"update handled",
		)
	})

	bot.command("start", callStart)
	bot.command("help", callHelp)
	bot.command("menu", callMenu)
	bot.command("switch", callSwitch)
	bot.command("cancel", callCancel)
	bot.on("message:text", dispatch)
	bot.on("callback_query:data", callCallback)

	bot.catch((error) => {
		logger.error({ err: error }, "bot update error")
	})

	return bot
}

export const setWebhookSafe = async (bot: Bot<BotContext>): Promise<void> => {
	if (config.polling || config.webhookDomain === "") {
		await bot.start({
			onStart: () => logger.info("bot started in polling mode"),
		})
		return
	}
	const url = `${config.webhookDomain.replace(/\/$/, "")}${config.webhookPath}`
	await bot.api.setWebhook(url, {
		secret_token: config.webhookSecret === "" ? undefined : config.webhookSecret,
	})
	logger.info({ url }, "webhook registered")
}

export const processUpdate = async (bot: Bot<BotContext>, update: unknown): Promise<void> => {
	if (typeof update !== "object" || update == null) return
	await bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0])
}

export const verifySecret = (headers: Headers): boolean => {
	if (config.webhookSecret === "") return true
	const header = headers.get("x-telegram-bot-api-secret-token") ?? ""
	return header === config.webhookSecret
}

export const requireChatId = (ctx: BotContext): number => {
	if (ctx.chatId == null) throw new Error("chat id missing on this update")
	return ctx.chatId
}

const next: NextFunction = async () => undefined
void next
