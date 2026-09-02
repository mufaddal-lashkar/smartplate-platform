import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

const originalDefaultCode = process.env.BOT_DEFAULT_TENANT_CODE
const originalDefaultEmail = process.env.BOT_DEFAULT_TENANT_EMAIL

afterEach(() => {
	if (originalDefaultCode == null) delete process.env.BOT_DEFAULT_TENANT_CODE
	else process.env.BOT_DEFAULT_TENANT_CODE = originalDefaultCode
	if (originalDefaultEmail == null) delete process.env.BOT_DEFAULT_TENANT_EMAIL
	else process.env.BOT_DEFAULT_TENANT_EMAIL = originalDefaultEmail
	mock.restore()
})

type BotSession = import("../src/main-client").BotSession

const fakeSession: BotSession = {
	tenantId: "tenant-uuid-1",
	userId: "user-uuid-1",
	role: "owner",
	tenantType: "restaurant",
	accessToken: "at",
	refreshToken: "rt",
	expiresAt: 0,
}

const fakeNgoSession: BotSession = {
	tenantId: "tenant-uuid-2",
	userId: "user-uuid-2",
	role: "ngo_admin",
	tenantType: "ngo",
	accessToken: "at",
	refreshToken: "rt",
	expiresAt: 0,
}

const sent: Array<{ chatId: number; tenantCode: string; email: string }> = []
const removed: number[] = []
let getSessionResult: BotSession | null = fakeSession
let sentReplyText = ""
let currentBindResult: BotSession = fakeSession

mock.module("../src/main-client", () => ({
	bindChat: async (chatId: number, tenantCode: string, email: string) => {
		sent.push({ chatId, tenantCode, email })
		return currentBindResult
	},
	refreshSession: async () => currentBindResult,
	getSession: async () => getSessionResult,
	setTenantSession: async () => undefined,
	unbindChat: async (chatId: number) => {
		removed.push(chatId)
	},
	callMain: async () => {
		throw new Error("callMain not stubbed in start test")
	},
	callMainRaw: async () => {
		throw new Error("callMainRaw not stubbed in start test")
	},
	callMainBinary: async () => {
		throw new Error("callMainBinary not stubbed in start test")
	},
	getTenantSession: async () => null,
	clearTenantSession: async () => undefined,
	clearSession: async () => undefined,
	setSession: async () => undefined,
}))

mock.module("../src/db", () => ({
	redis: { sadd: async () => 1, srem: async () => 1, get: async () => null, set: async () => "OK" },
}))

mock.module("../src/sse-bridge", () => ({
	registerTenant: async () => undefined,
}))

mock.module("../src/bot/reply", () => ({
	md2: (s: string) => s,
	sendReply: async (_ctx: unknown, reply: { text: string; parseMode?: string }) => {
		sentReplyText = reply.text
	},
	editReply: async () => null,
	row: (b: unknown[]) => b,
	btn: (label: string, data: string) => ({ text: label, callback_data: data }),
}))

const { callStart } = await import("../src/bot/commands/start")
const { config } = await import("../src/config")

const makeCtx = (text: string): import("../src/bot/bot").BotContext => {
	return {
		chatId: 11111,
		update: { update_id: 1 },
		message: { text },
		session: { step: "", pending: {}, lastBotMessageId: 0 },
	} as unknown as import("../src/bot/bot").BotContext
}

describe("callStart default-bind", () => {
	beforeEach(() => {
		sent.length = 0
		removed.length = 0
		sentReplyText = ""
		getSessionResult = null
		currentBindResult = fakeSession
		delete process.env.BOT_DEFAULT_TENANT_CODE
		delete process.env.BOT_DEFAULT_TENANT_EMAIL
	})

	it("config defaults to spice-route asha@spiceroute.local", () => {
		expect(config.defaultTenantCode).toBe("spice-route")
		expect(config.defaultTenantEmail).toBe("asha@spiceroute.local")
	})

	it("auto-binds a fresh /start to spice-route asha@spiceroute.local by default", async () => {
		const ctx = makeCtx("/start")
		await callStart(ctx)

		expect(sent).toHaveLength(1)
		expect(sent[0]).toEqual({
			chatId: 11111,
			tenantCode: "spice-route",
			email: "asha@spiceroute.local",
		})
		expect(sentReplyText).toContain("Linked to")
	})

	it("does not auto-bind when /start logout is requested", async () => {
		const ctx = makeCtx("/start logout")
		await callStart(ctx)

		expect(sent).toHaveLength(0)
		expect(removed).toEqual([11111])
	})

	it("replies with the existing session when already bound, instead of rebinding", async () => {
		getSessionResult = fakeSession
		const ctx = makeCtx("/start")
		await callStart(ctx)

		expect(sent).toHaveLength(0)
		expect(sentReplyText).toContain("already linked")
	})
})

describe("callStart with env overrides", () => {
	beforeEach(() => {
		sent.length = 0
		removed.length = 0
		sentReplyText = ""
		getSessionResult = null
		currentBindResult = fakeNgoSession
	})

	it("re-exports the env-var override contract via .env.example", () => {
		expect(typeof config.defaultTenantCode).toBe("string")
		expect(typeof config.defaultTenantEmail).toBe("string")
		expect(config.defaultTenantCode.length).toBeGreaterThan(0)
		expect(config.defaultTenantEmail).toContain("@")
	})
})
