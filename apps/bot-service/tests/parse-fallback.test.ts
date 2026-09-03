import { describe, expect, it } from "bun:test"
import { isValidTenantCode, parseFallback } from "../src/parse-fallback"

describe("parseFallback", () => {
	it("matches inventory.stock on 'what do i have'", () => {
		expect(parseFallback("what do i have").intent).toBe("inventory.stock")
	})

	it("prefers leftovers.record over leftovers.list when logging", () => {
		expect(parseFallback("log leftover 4 plates of paneer").intent).toBe("leftovers.record")
	})

	it("still reads leftovers.list for a plain query", () => {
		expect(parseFallback("show me leftovers").intent).toBe("leftovers.list")
	})

	it("extracts qty, unit and meal period for prep.create", () => {
		const result = parseFallback("prepped 3 kg basmati for lunch")
		expect(result.intent).toBe("prep.create")
		expect(result.entities.qty).toBe("3")
		expect(result.entities.unit).toBe("kg")
		expect(result.entities.mealPeriod).toBe("lunch")
	})

	it("extracts a quantity for a purchase", () => {
		const result = parseFallback("bought 3 kg of basmati rice")
		expect(result.intent).toBe("inventory.purchases.create")
		expect(result.entities.qty).toBe("3")
	})

	it("returns entity values as strings so the dispatcher sees one type", () => {
		for (const value of Object.values(parseFallback("prepped 3 kg basmati").entities)) {
			expect(typeof value).toBe("string")
		}
	})

	it("returns unknown when no keyword matches", () => {
		expect(parseFallback("buy a unicorn").intent).toBe("unknown")
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
