import { describe, expect, it } from "bun:test"
import { isValidTenantCode, parseFallback } from "../src/parse-fallback"

describe("parseFallback", () => {
	it("matches inventory.stock on 'what do i have'", () => {
		const result = parseFallback("what do i have")
		expect(result.intent).toBe("inventory.stock")
	})

	it("matches leftovers.list on 'leftovers'", () => {
		const result = parseFallback("show me leftovers")
		expect(result.intent).toBe("leftovers.list")
	})

	it("extracts qty and unit for prep.create", () => {
		const result = parseFallback("prepped 3 kg basmati for lunch")
		expect(result.intent).toBe("prep.create")
		expect(result.entities.qty).toBe(3)
		expect(result.entities.unit).toBe("kg")
		expect(result.entities.mealPeriod).toBe("lunch")
	})

	it("asks for qty when missing", () => {
		const result = parseFallback("leftover 3 portions of paneer")
		expect(result.intent).toBe("leftovers.record")
		expect(result.needs_clarification).not.toContain("qty")
		expect(result.entities.qty).toBe(3)
	})

	it("returns unknown when no keyword matches", () => {
		const result = parseFallback("buy a unicorn")
		expect(result.intent).toBe("unknown")
		expect(result.needs_clarification).toContain("intent")
	})
})

describe("isValidTenantCode", () => {
	it("accepts kebab-case", () => {
		expect(isValidTenantCode("spice-route")).toBe(true)
		expect(isValidTenantCode("akshaya-trust-2026")).toBe(true)
	})

	it("rejects spaces and uppercase", () => {
		expect(isValidTenantCode("spice route")).toBe(false)
		expect(isValidTenantCode("Spice-Route")).toBe(false)
	})
})
