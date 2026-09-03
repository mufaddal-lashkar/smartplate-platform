const required = (name: string, fallback = ""): string => process.env[name] ?? fallback

export type Persona = {
	key: string
	label: string
	tenantCode: string
	email: string
	blurb: string
}

export const PERSONAS: Persona[] = [
	{
		key: "asha",
		label: "🍛 Asha — Spice Route owner",
		tenantCode: "spice-route",
		email: "asha@spiceroute.local",
		blurb: "90 days of kitchen history. Log prep, decide leftovers, watch the waterfall.",
	},
	{
		key: "ravi",
		label: "🤝 Ravi — Akshaya Trust (NGO)",
		tenantCode: "akshaya-trust",
		email: "ravi@akshaya.local",
		blurb: "A verified NGO. Browse donations, claim them, complete the pickup.",
	},
	{
		key: "meera",
		label: "🍽 Meera — Anna Tiffin owner",
		tenantCode: "anna-tiffin",
		email: "meera@annatiffin.local",
		blurb: "A second restaurant, so you can buy Spice Route's B2B surplus.",
	},
]

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
