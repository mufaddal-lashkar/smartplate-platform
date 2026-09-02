const required = (name: string, fallback = ""): string => process.env[name] ?? fallback

export const config = {
	port: Number(process.env.PORT ?? 3001),
	webhookDomain: required("TELEGRAM_WEBHOOK_URL"),
	webhookPath: required("BOT_WEBHOOK_PATH", "/telegram/webhook"),
	webhookSecret: required("TELEGRAM_WEBHOOK_SECRET"),
	polling: process.env.BOT_POLLING === "true",
	telegramToken: required("TELEGRAM_BOT_TOKEN"),
	mainUrl: required("MAIN_URL", "http://main-service:3000"),
	agentUrl: required("AGENT_URL", "http://agent-service:8000"),
	serviceToken: required("SERVICE_TOKEN", "dev-service-token"),
	redisUrl: required("REDIS_URL", "redis://redis:6379"),
	requestTimeoutMs: Number(process.env.BOT_REQUEST_TIMEOUT_MS ?? 25_000),
	logLevel: required("LOG_LEVEL", "info"),
	defaultTenantCode: required("BOT_DEFAULT_TENANT_CODE", "spice-route"),
	defaultTenantEmail: required("BOT_DEFAULT_TENANT_EMAIL", "asha@spiceroute.local"),
}

export type Config = typeof config
