import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import type { PlanIntentResponse, PlanStepWire } from "../src/agent-client"
import type { BotContext } from "../src/bot/bot"

class MockMainApiError extends Error {
	readonly code: string
	readonly status: number
	constructor(code: string, status: number, message: string) {
		super(message)
		this.name = "MainApiError"
		this.code = code
		this.status = status
	}
}

type AgentPlanResult = { plan: PlanStepWire[] } | null
type AgentPlanRequest = {
	requestId: string
	text: string
	userRole: string
	tenantType: string
	today: string
}

let mockPlanResult: AgentPlanResult = null
const mockPlanRequests: AgentPlanRequest[] = []
let mockGetSessionResult: { role: string; tenantType: "restaurant" | "ngo" } | null = {
	role: "owner",
	tenantType: "restaurant",
}
let lastSentReply: {
	text: string
	rows?: Array<Array<{ text: string; callback_data: string }>>
} | null = null

const mainClientMock = new Proxy(
	{
		MainApiError: MockMainApiError,
		callMain: async () => ({ items: [] }),
		callMainBinary: async () => new Uint8Array(),
		getSession: async () => mockGetSessionResult,
		setSession: async () => {},
		clearSession: async () => {},
		getTenantSession: async () => null,
		refreshTenantSessionNow: async () => null,
		setTenantSession: async () => {},
		clearTenantSession: async () => {},
		bindChat: async () => {},
		unbindChat: async () => {},
	},
	{
		get(target, prop) {
			if (prop in target) {
				return target[prop as keyof typeof target]
			}
			return () => null
		},
	},
)

mock.module("../src/agent-client", () => ({
	callAgent: async () => null,
	callPlanAgent: async (request: AgentPlanRequest) => {
		mockPlanRequests.push(request)
		return mockPlanResult
	},
}))

mock.module("../src/main-client", () => mainClientMock)

const redisStore = new Map<string, string>()
const redisMock = {
	get: async (key: string) => redisStore.get(key) ?? null,
	set: async (key: string, value: string) => {
		redisStore.set(key, value)
		return "OK"
	},
	del: async (key: string) => {
		redisStore.delete(key)
		return 1
	},
}

mock.module("../src/db", () => ({
	redis: redisMock,
	createRedis: () => redisMock,
}))

const { planDispatch } = await import("../src/orchestrator")

const step = (
	intent: string,
	params: Record<string, string | number | boolean> = {},
	overrides: Partial<PlanStepWire> = {},
): PlanStepWire => ({
	intent,
	params,
	rationale: overrides.rationale ?? "test step",
	requiresConfirmation: overrides.requiresConfirmation ?? false,
})

const makeCtx = (text: string, updateId = 1): BotContext => {
	const ctx = {
		chatId: 11111,
		update: { update_id: updateId },
		message: { text },
		reply: async (text: string, options?: { reply_markup?: { inline_keyboard?: unknown } }) => {
			lastSentReply = {
				text,
				rows: options?.reply_markup?.inline_keyboard as Array<
					Array<{ text: string; callback_data: string }>
				>,
			}
			return { message_id: 1 } as never
		},
		answerCallbackQuery: async () => {},
		replyWithDocument: async () => ({ message_id: 1 }) as never,
		api: { editMessageText: async () => true },
	} as unknown as BotContext
	return ctx
}

const reset = () => {
	mockPlanResult = null
	mockPlanRequests.length = 0
	mockGetSessionResult = { role: "owner", tenantType: "restaurant" }
	redisStore.clear()
	lastSentReply = null
}

beforeEach(() => {
	reset()
})

afterEach(() => {
	mock.restore()
	mock.module("../src/agent-client", () => ({
		callAgent: async () => null,
		callPlanAgent: async (request: AgentPlanRequest) => {
			mockPlanRequests.push(request)
			return mockPlanResult
		},
	}))
	mock.module("../src/main-client", () => mainClientMock)
	mock.module("../src/db", () => ({
		redis: redisMock,
		createRedis: () => redisMock,
	}))
})

describe("planDispatch — plan agent path", () => {
	it("calls the agent and executes a non-confirmation step", async () => {
		mockPlanResult = { plan: [step("inventory.stock", {}, { requiresConfirmation: false })] }
		await planDispatch(makeCtx("show me the stock"))
		expect(mockPlanRequests).toHaveLength(1)
		expect(mockPlanRequests[0]?.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
	})

	it("renders a confirmation card for a destructive step", async () => {
		mockPlanResult = { plan: [step("listings.cancel", { listingId: "L-1" })] }
		await planDispatch(makeCtx("cancel listing L-1"))
		expect(lastSentReply).not.toBeNull()
		expect(lastSentReply?.text).toMatch(/Go ahead\?/)
		expect(lastSentReply?.rows).toBeDefined()
	})

	it("renders a confirmation card when the step explicitly requires confirmation", async () => {
		mockPlanResult = {
			plan: [step("listings.cancel", { listingId: "L-1" }, { requiresConfirmation: true })],
		}
		await planDispatch(makeCtx("cancel listing L-1"))
		expect(lastSentReply?.text).toMatch(/Go ahead\?/)
	})
})

describe("planDispatch — fallback path", () => {
	it("falls back to the local parser when agent returns no plan", async () => {
		mockPlanResult = null
		await planDispatch(makeCtx("leftover 4 plates of paneer butter masala"))
		expect(mockPlanRequests).toHaveLength(1)
	})

	it("falls back to a menu step when the parser returns unknown", async () => {
		mockPlanResult = null
		await planDispatch(makeCtx("xyzzy fizzle"))
		expect(mockPlanRequests).toHaveLength(1)
	})

	it("uses fallback confirmation flag for destructive intents", async () => {
		mockPlanResult = {
			plan: [step("listings.cancel", { listingId: "L-9" }, { requiresConfirmation: true })],
		}
		await planDispatch(makeCtx("cancel listing L-9"))
		expect(lastSentReply?.text).toMatch(/Go ahead\?/)
	})
})

describe("planDispatch — session checks", () => {
	it("asks the user to /start when no session is bound", async () => {
		mockGetSessionResult = null
		await planDispatch(makeCtx("show stock"))
		expect(lastSentReply?.text).toMatch(/\/start/)
		expect(mockPlanRequests).toHaveLength(0)
	})

	it("returns silently when there is no message text", async () => {
		const ctx = {
			chatId: 22222,
			update: { update_id: 2 },
			message: {},
		} as unknown as BotContext
		await planDispatch(ctx)
		expect(mockPlanRequests).toHaveLength(0)
	})
})

describe("planDispatch — multi-step plans", () => {
	it("walks every step in the plan until one halts", async () => {
		mockPlanResult = {
			plan: [
				step("leftovers.list", {}, { rationale: "show me what's there" }),
				step("leftovers.record", {
					dish: "paneer butter masala",
					qty: 4,
					unit: "plate",
				}),
			],
		}
		await planDispatch(makeCtx("leftover 4 plates of paneer butter masala"))
		expect(mockPlanRequests).toHaveLength(1)
	})

	it("halts on the first step that needs more input", async () => {
		mockPlanResult = {
			plan: [step("leftovers.record", {}, { rationale: "need qty" }), step("leftovers.list")],
		}
		await planDispatch(makeCtx("leftover", 3))
		expect(lastSentReply).not.toBeNull()
	})
})

describe("planDispatch — plan validity", () => {
	it("replies with a fallback when the plan contains an unknown intent", async () => {
		mockPlanResult = { plan: [step("nonexistent.intent")] }
		await planDispatch(makeCtx("do the thing"))
		expect(lastSentReply?.text).toMatch(/didn't catch that/)
	})
})

describe("planDispatch — type contract", () => {
	it("PlanIntentResponse shape is forwarded (camelCase keys)", () => {
		const sample: PlanIntentResponse = {
			promptVersion: "v1",
			model: "gemini-2.5-flash",
			source: "model",
			plan: [step("help")],
			confidence: 0.9,
			needsClarification: [],
			basis: "test",
		}
		expect(sample.source).toBe("model")
		expect(sample.plan[0]?.intent).toBe("help")
	})
})
