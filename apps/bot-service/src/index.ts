import { commandIntents } from "@smartplate/contracts/intents"
import { Elysia } from "elysia"
import { InputFile } from "grammy"
import { createBot, processUpdate, verifySecret } from "./bot/bot"
import { config } from "./config"
import { documentFor, type ReportRecord } from "./handlers/reports"
import { logger } from "./logger"
import { callMain } from "./main-client"
import { listBoundChats, startSseBridge } from "./sse-bridge"

const buildApp = (bot: ReturnType<typeof createBot>) =>
	new Elysia()
		.get("/health", () => ({ status: "ok", service: "bot-service" }))
		.post("/telegram/webhook", async ({ request }) => {
			if (!verifySecret(request.headers)) {
				return new Response("forbidden", { status: 403 })
			}
			const update = (await request.json().catch(() => null)) as unknown
			await processUpdate(bot, update)
			return new Response("ok")
		})
		.get("/v1/bot/tenants/:tenantId/chats", async ({ params }) => ({
			chats: await listBoundChats(String(params.tenantId)),
		}))

const registerCommands = async (bot: ReturnType<typeof createBot>): Promise<void> => {
	await bot.api.setMyCommands([
		{ command: "start", description: "Link this chat or switch persona" },
		{ command: "menu", description: "Everything I can do" },
		{ command: "help", description: "How to talk to me" },
		...commandIntents().map((entry) => ({
			command: entry.command,
			description: entry.buttonLabel === "" ? entry.intent : entry.buttonLabel,
		})),
		{ command: "cancel", description: "Stop what you're doing" },
	])
}

const start = async (): Promise<void> => {
	const bot = createBot()
	const app = buildApp(bot)

	if (!config.polling) {
		const url = `${config.webhookDomain.replace(/\/$/, "")}${config.webhookPath}`
		await bot.api.setWebhook(url, {
			secret_token: config.webhookSecret === "" ? undefined : config.webhookSecret,
		})
		logger.info({ url }, "telegram webhook set")
	} else {
		void bot.start({ onStart: () => logger.info("bot started in polling mode") })
	}

	await registerCommands(bot).catch((err) => {
		logger.warn({ err }, "setMyCommands failed")
	})

	await startSseBridge({
		sendMessage: async (chatId, card) => {
			await bot.api.sendMessage(chatId, card.text, {
				parse_mode: "HTML",
				reply_markup: card.rows.length === 0 ? undefined : { inline_keyboard: card.rows },
			})
		},
		sendReport: async (chatId, reportId) => {
			const report = await callMain<ReportRecord>(chatId, `/v1/reports/${reportId}`)
			if (report.status !== "succeeded") return
			const document = await documentFor(chatId, report)
			await bot.api.sendDocument(
				chatId,
				new InputFile(Buffer.from(document.bytes), document.filename),
				{ caption: document.caption },
			)
		},
	})

	app.listen({ port: config.port, hostname: "0.0.0.0" })
	logger.info({ port: config.port }, "bot-service listening")
}

start().catch((err: Error) => {
	logger.fatal({ err }, "bot-service failed to start")
	process.exit(1)
})
