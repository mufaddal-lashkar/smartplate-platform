import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import dayjs from "dayjs"
import {
	findFirstMissing,
	resolveParams,
	resolveSingleDate,
	resolveSingleDateRange,
	validateRangeVocab,
} from "../src/plan-params"

const FROZEN_NOW = dayjs("2026-09-03T10:00:00Z")

const callMainCalls: Array<{ path: string; body: unknown }> = []

let dishItems: Array<{ id: string; name: string }> = []

mock.module("../src/main-client", () => ({
	callMain: async (_chatId: number, path: string, options: { body?: unknown } = {}) => {
		callMainCalls.push({ path, body: options.body })
		if (path === "/v1/dishes") {
			return { items: dishItems }
		}
		throw new Error(`unexpected callMain path ${path}`)
	},
}))

const makeCtx = (chatId = 11111) =>
	({
		chatId,
		update: { update_id: 1 },
		message: { text: "x" },
	}) as unknown as import("../src/bot/bot").BotContext

beforeEach(() => {
	callMainCalls.length = 0
	dishItems = [
		{ id: "dish-1", name: "Paneer Butter Masala" },
		{ id: "dish-2", name: "Paneer Tikka Masala" },
	]
})

afterEach(() => {
	mock.restore()
})

describe("resolveSingleDateRange", () => {
	it("expands today to a same-day range", () => {
		expect(resolveSingleDateRange("today", FROZEN_NOW)).toEqual({
			from: "2026-09-03",
			to: "2026-09-03",
		})
	})

	it("expands last-3-days to a 3-day window", () => {
		expect(resolveSingleDateRange("last-3-days", FROZEN_NOW)).toEqual({
			from: "2026-09-01",
			to: "2026-09-03",
		})
	})

	it("expands last-7-days to a 7-day window", () => {
		expect(resolveSingleDateRange("last-7-days", FROZEN_NOW)).toEqual({
			from: "2026-08-28",
			to: "2026-09-03",
		})
	})

	it("parses explicit YYYY-MM-DD..YYYY-MM-DD", () => {
		expect(resolveSingleDateRange("2026-08-01..2026-08-31", FROZEN_NOW)).toEqual({
			from: "2026-08-01",
			to: "2026-08-31",
		})
	})
})

describe("resolveSingleDate", () => {
	it("returns today by default for unknown vocabulary", () => {
		expect(resolveSingleDate("unknown", FROZEN_NOW)).toBe("2026-09-03")
	})

	it("returns the explicit ISO date when given", () => {
		expect(resolveSingleDate("2026-08-15", FROZEN_NOW)).toBe("2026-08-15")
	})
})

describe("validateRangeVocab", () => {
	it("accepts every closed vocabulary word", () => {
		for (const word of [
			"today",
			"yesterday",
			"last-3-days",
			"last-7-days",
			"last-14-days",
			"last-28-days",
			"this-week",
			"this-month",
			"last-month",
		]) {
			expect(validateRangeVocab(word)).toBe(true)
		}
	})

	it("accepts explicit date-range syntax", () => {
		expect(validateRangeVocab("2026-08-01..2026-08-31")).toBe(true)
	})

	it("rejects an unparseable value", () => {
		expect(validateRangeVocab("next-tuesday")).toBe(false)
	})
})

describe("resolveParams — date adapters", () => {
	it("resolves period for reports.create", async () => {
		const out = await resolveParams(
			makeCtx(),
			"reports.create",
			{ reportType: "waste", period: "last-3-days", format: "pdf" },
			FROZEN_NOW,
		)
		expect(out.resolved.reportType).toBe("waste")
		expect(out.resolved.format).toBe("pdf")
		expect(out.missing).toEqual([])
		expect(out.clarification).toBeNull()
	})

	it("rejects an out-of-vocabulary date-range value", async () => {
		await expect(
			resolveParams(makeCtx(), "reports.create", { period: "next-tuesday" }, FROZEN_NOW),
		).rejects.toThrow(/closed vocabulary/)
	})
})

describe("resolveParams — dish adapter", () => {
	it("resolves a single matching dish and returns its id", async () => {
		const out = await resolveParams(
			makeCtx(),
			"leftovers.record",
			{ dish: "paneer butter masala", qty: 4, unit: "plate" },
			FROZEN_NOW,
		)
		expect(out.resolved.dish).toBe("dish-1")
		expect(out.missing).toEqual([])
		expect(out.clarification).toBeNull()
	})

	it("returns a clarification card for multiple candidates", async () => {
		const out = await resolveParams(
			makeCtx(),
			"leftovers.record",
			{ dish: "paneer", qty: 4, unit: "plate" },
			FROZEN_NOW,
		)
		expect(out.clarification).not.toBeNull()
		expect(out.clarification?.kind).toBe("dish")
		expect(out.clarification?.candidates.length).toBeGreaterThan(1)
	})

	it("marks the adapter missing when there are no candidates", async () => {
		dishItems = []
		const out = await resolveParams(
			makeCtx(),
			"leftovers.record",
			{ dish: "biryani", qty: 4, unit: "plate" },
			FROZEN_NOW,
		)
		expect(out.clarification).toBeNull()
		expect(out.missing).toContain("dish")
	})
})

describe("resolveParams — unit adapter", () => {
	it("normalises plurals", async () => {
		const out = await resolveParams(
			makeCtx(),
			"leftovers.record",
			{ dish: "Paneer Butter Masala", qty: 4, unit: "plates" },
			FROZEN_NOW,
		)
		expect(out.resolved.unit).toBe("plate")
	})

	it("passes through unknown units unchanged", async () => {
		const out = await resolveParams(
			makeCtx(),
			"leftovers.record",
			{ dish: "Paneer Butter Masala", qty: 4, unit: "scoop" },
			FROZEN_NOW,
		)
		expect(out.resolved.unit).toBe("scoop")
	})
})

describe("resolveParams — reserved keys (R36)", () => {
	it("rejects a safeUntil param key from a malicious plan", async () => {
		await expect(
			resolveParams(
				makeCtx(),
				"leftovers.record",
				{ dish: "Paneer Butter Masala", qty: 4, unit: "plate", safeUntil: "2026-09-04T18:00:00Z" },
				FROZEN_NOW,
			),
		).rejects.toThrow(/reserved/)
	})
})

describe("findFirstMissing", () => {
	it("returns required param names that are not present", () => {
		const missing = findFirstMissing("leftovers.record", { dish: "x" })
		expect(missing).toContain("qty")
	})

	it("returns an empty array when all required params are present", () => {
		const missing = findFirstMissing("leftovers.record", { dish: "x", qty: 4 })
		expect(missing).toEqual([])
	})

	it("returns an empty array for intents with no param adapters", () => {
		const missing = findFirstMissing("help", {})
		expect(missing).toEqual([])
	})
})
