import { Elysia } from "elysia"
import { createBot, processUpdate, verifySecret } from "./bot/bot"
import { config } from "./config"
import { logger } from "./logger"
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
		.get("/v1/bot/tenants/:tenantId/chats", async ({ params }) => {
			const tenantId = String(params.tenantId)
			const chats = await listBoundChats(tenantId)
			return { chats }
		})

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
		void bot.start({
			onStart: () => logger.info("bot started in polling mode"),
		})
	}

	await startSseBridge({
		bot,
		sendMessage: async (chatId, text) => {
			await bot.api.sendMessage(chatId, text, { parse_mode: "MarkdownV2" }).catch((err) => {
				logger.warn({ err, chatId }, "sendMessage failed; retrying without parse mode")
				return bot.api.sendMessage(chatId, text)
			})
		},
	})

	app.listen({ port: config.port, hostname: "0.0.0.0" })
	logger.info({ port: config.port }, "bot-service listening")
}

start().catch((err: Error) => {
	logger.fatal({ err }, "bot-service failed to start")
	process.exit(1)
})
