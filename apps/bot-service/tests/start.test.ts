import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import type { InlineKeyboardButton } from "grammy/types"

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

const sent: Array<{ chatId: number; tenantCode: string; email: string }> = []
const removed: number[] = []
let getSessionResult: BotSession | null = null
let sentReplyText = ""
let sentRows: InlineKeyboardButton[][] = []

mock.module("../src/main-client", () => ({
	bindChat: async (chatId: number, tenantCode: string, email: string) => {
		sent.push({ chatId, tenantCode, email })
		return fakeSession
	},
	getSession: async () => getSessionResult,
	setTenantSession: async () => undefined,
	unbindChat: async (chatId: number) => {
		removed.push(chatId)
	},
	callMain: async () => {
		throw new Error("callMain not stubbed in start test")
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
	redis: {
		sadd: async () => 1,
		srem: async () => 1,
		get: async () => null,
		set: async () => "OK",
		del: async () => 1,
	},
}))

mock.module("../src/sse-bridge", () => ({
	registerTenant: async () => undefined,
}))

mock.module("../src/resolver", () => ({
	mintToken: async () => "tok12345",
	encodeAction: (intent: string, token: string) => `a:${intent}:${token}`,
}))

mock.module("../src/bot/reply", () => ({
	sendReply: async (_ctx: unknown, reply: { text: string; rows?: InlineKeyboardButton[][] }) => {
		sentReplyText = reply.text
		sentRows = reply.rows ?? []
		return 1
	},
	editReply: async () => undefined,
	row: (buttons: InlineKeyboardButton[]) => buttons,
	btn: (label: string, data: string) => ({ text: label, callback_data: data }),
}))

const { bindPersona, callStart } = await import("../src/bot/commands/start")
const { PERSONAS } = await import("../src/config")

const makeCtx = (text: string): import("../src/bot/bot").BotContext =>
	({
		chatId: 11111,
		update: { update_id: 1 },
		message: { text },
	}) as unknown as import("../src/bot/bot").BotContext

afterEach(() => {
	mock.restore()
})

beforeEach(() => {
	sent.length = 0
	removed.length = 0
	sentReplyText = ""
	sentRows = []
	getSessionResult = null
})

describe("persona configuration", () => {
	it("offers exactly Asha, Ravi and Meera", () => {
		expect(PERSONAS.map((persona) => persona.key)).toEqual(["asha", "ravi", "meera"])
	})

	it("points each persona at a seeded tenant and email", () => {
		for (const persona of PERSONAS) {
			expect(persona.tenantCode).toMatch(/^[a-z0-9-]+$/)
			expect(persona.email).toContain("@")
			expect(persona.blurb).not.toBe("")
		}
	})
})

describe("callStart persona picker", () => {
	it("offers one button per persona on a bare /start with no session", async () => {
		await callStart(makeCtx("/start"))
		expect(sent).toHaveLength(0)
		expect(sentReplyText).toContain("Who are you today")
		const labels = sentRows.flat().map((button) => button.text)
		expect(labels).toHaveLength(3)
		expect(labels.some((label) => label.includes("Asha"))).toBe(true)
		expect(labels.some((label) => label.includes("Ravi"))).toBe(true)
		expect(labels.some((label) => label.includes("Meera"))).toBe(true)
	})

	it("binds the chosen persona when its callback fires", async () => {
		await bindPersona(makeCtx("/start"), 11111, "asha")
		expect(sent).toEqual([
			{ chatId: 11111, tenantCode: "spice-route", email: "asha@spiceroute.local" },
		])
	})

	it("binds the NGO persona to akshaya-trust", async () => {
		await bindPersona(makeCtx("/start"), 11111, "ravi")
		expect(sent).toEqual([
			{ chatId: 11111, tenantCode: "akshaya-trust", email: "ravi@akshaya.local" },
		])
	})

	it("rejects an unknown persona key without binding", async () => {
		await bindPersona(makeCtx("/start"), 11111, "nobody")
		expect(sent).toHaveLength(0)
		expect(sentReplyText).toContain("don't know that persona")
	})

	it("still honours an explicit /start <tenant> <email>", async () => {
		await callStart(makeCtx("/start green-bowl karthik@greenbowl.local"))
		expect(sent).toEqual([
			{ chatId: 11111, tenantCode: "green-bowl", email: "karthik@greenbowl.local" },
		])
	})

	it("rejects a malformed /start argument", async () => {
		await callStart(makeCtx("/start Not A Code"))
		expect(sent).toHaveLength(0)
		expect(sentReplyText).toContain("tenant and email")
	})

	it("does not re-bind when already linked", async () => {
		getSessionResult = fakeSession
		await callStart(makeCtx("/start"))
		expect(sent).toHaveLength(0)
		expect(sentReplyText).toContain("already linked")
	})

	it("unlinks on /start logout", async () => {
		await callStart(makeCtx("/start logout"))
		expect(sent).toHaveLength(0)
		expect(removed).toEqual([11111])
	})
})
