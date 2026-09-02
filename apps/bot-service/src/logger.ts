import pino from "pino"
import { config } from "./config"

export const logger = pino({
	level: config.logLevel,
	redact: {
		paths: [
			"*.token",
			"*.TELEGRAM_BOT_TOKEN",
			"*.SERVICE_TOKEN",
			"req.headers.authorization",
			"req.headers.cookie",
			"req.headers['x-service-token']",
			"req.headers['x-telegram-bot-api-secret-token']",
		],
		censor: "[redacted]",
	},
})
