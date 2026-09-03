import { describe, expect, it } from "bun:test"
import { findIntent, INTENTS, menuSections } from "@smartplate/contracts/intents"
import dayjs from "dayjs"
import { dispatchTable } from "../src/handlers"
import { marketRow } from "../src/handlers/market"
import { CALLBACK_DATA_LIMIT, decodeCallback, encodeAction, encodeConfirm } from "../src/resolver"

describe("intent registry", () => {
	it("carries 62 domain intents plus help and menu, with unique names", () => {
		expect(INTENTS).toHaveLength(64)
		expect(new Set(INTENTS.map((entry) => entry.intent)).size).toBe(64)
	})

	it("gives every registry intent a handler in the dispatch table", () => {
		for (const entry of INTENTS) {
			expect(dispatchTable[entry.intent]).toBeDefined()
		}
	})

	it("gives every dispatch table entry a registry spec", () => {
		for (const intent of Object.keys(dispatchTable)) {
			expect(findIntent(intent)).not.toBeNull()
		}
	})

	it("points every listIntent at a real intent that takes no entities", () => {
		for (const entry of INTENTS) {
			if (entry.listIntent === "") continue
			const target = findIntent(entry.listIntent)
			expect(target).not.toBeNull()
			expect(target?.requiredEntities).toEqual([])
		}
	})

	it("gives every intent that needs entities either an example or a listIntent", () => {
		for (const entry of INTENTS) {
			if (entry.requiredEntities.length === 0) continue
			expect(entry.example !== "" || entry.listIntent !== "").toBe(true)
		}
	})

	it("gives an owner a Kitchen, Market and Insights section", () => {
		const sections = menuSections("owner", "restaurant").map((group) => group.section)
		expect(sections).toContain("Kitchen")
		expect(sections).toContain("Market")
		expect(sections).toContain("Insights")
	})

	it("hides restaurant sections from an ngo_admin but keeps the market", () => {
		const specs = menuSections("ngo_admin", "ngo").flatMap((group) => group.specs)
		expect(specs.some((entry) => entry.intent === "inventory.stock")).toBe(false)
		expect(specs.some((entry) => entry.intent === "market.browse")).toBe(true)
	})

	it("keeps admin intents out of every menu", () => {
		const cases = [
			["owner", "restaurant"],
			["staff", "restaurant"],
			["ngo_admin", "ngo"],
			["ngo_volunteer", "ngo"],
		] as const
		for (const [role, tenantType] of cases) {
			const specs = menuSections(role, tenantType).flatMap((group) => group.specs)
			expect(specs.some((entry) => entry.intent.startsWith("admin."))).toBe(false)
		}
	})

	it("keeps the four kitchen write intents off the menu, since a button cannot collect a qty", () => {
		const kitchenWrites = [
			"prep.create",
			"leftovers.record",
			"inventory.purchases.create",
			"inventory.adjustments.create",
		]
		for (const intent of kitchenWrites) {
			expect(findIntent(intent)?.menuSection).toBe("")
			expect(findIntent(intent)?.buttonLabel).toBe("")
		}
	})

	it("never lets a menu button dead-end: one that needs fields must teach the syntax", () => {
		for (const entry of INTENTS) {
			if (entry.menuSection === "") continue
			if (entry.requiredEntities.length === 0) continue
			expect(entry.example !== "" || entry.listIntent !== "").toBe(true)
		}
	})
})

describe("callback encoding", () => {
	it("round-trips an action", () => {
		expect(decodeCallback(encodeAction("market.claim", "7fA3xK2p"))).toEqual({
			kind: "action",
			intent: "market.claim",
			token: "7fA3xK2p",
		})
	})

	it("round-trips a confirm", () => {
		expect(decodeCallback(encodeConfirm("listings.cancel", "7fA3xK2p"))).toEqual({
			kind: "confirm",
			intent: "listings.cancel",
			token: "7fA3xK2p",
		})
	})

	it("keeps every intent inside Telegram's callback_data budget", () => {
		for (const entry of INTENTS) {
			expect(encodeConfirm(entry.intent, "12345678").length).toBeLessThanOrEqual(
				CALLBACK_DATA_LIMIT,
			)
		}
	})

	it("returns null for malformed data", () => {
		expect(decodeCallback("garbage")).toBeNull()
		expect(decodeCallback("x:market.claim:abc")).toBeNull()
		expect(decodeCallback("a:market.claim")).toBeNull()
		expect(decodeCallback("noop")).toBeNull()
	})
})

describe("marketRow", () => {
	const listing = {
		id: "l1",
		tenantId: "t1",
		channel: "b2b" as const,
		pricePerUnit: "90",
		qty: "12",
		unit: "plate",
		pickupFrom: "2026-09-03T18:15:00Z",
		pickupUntil: "2026-09-03T21:30:00Z",
		safeUntil: "2026-09-03T21:20:00Z",
		claimedByTenantId: null,
		restaurantName: "Spice Route",
		restaurantCity: "Bengaluru",
	}

	it("renders name, city, quantity, price and safety window", () => {
		const text = marketRow(listing, dayjs("2026-09-03T18:00:00Z"))
		expect(text).toContain("Spice Route")
		expect(text).toContain("Bengaluru")
		expect(text).toContain("12 plates")
		expect(text).toContain("₹90")
		expect(text).toContain("safe for 3h 20m")
	})

	it("marks a donation listing as free rather than ₹0", () => {
		const text = marketRow(
			{ ...listing, channel: "ngo", pricePerUnit: "0" },
			dayjs("2026-09-03T18:00:00Z"),
		)
		expect(text).toContain("Free")
		expect(text).not.toContain("₹0")
	})
})

describe("handler hygiene", () => {
	const handlerFiles = async (): Promise<string[]> => {
		const glob = new Bun.Glob("apps/bot-service/src/handlers/*.ts")
		const paths: string[] = []
		for await (const path of glob.scan(".")) paths.push(path)
		return paths
	}

	it("reads qtyOnHand from the stock aggregate, not totalRemaining", async () => {
		const source = await Bun.file("apps/bot-service/src/handlers/inventory.ts").text()
		expect(source).toContain("qtyOnHand")
		expect(source).not.toContain("totalRemaining")
	})

	it("calls the real dashboard and forecast routes", async () => {
		const source = await Bun.file("apps/bot-service/src/handlers/analytics.ts").text()
		expect(source).toContain("/v1/dashboard")
		expect(source).toContain("/v1/forecasts")
		expect(source).not.toContain("/v1/analytics/dashboard")
		expect(source).not.toContain("/v1/analytics/forecasts")
	})

	it("reads the real analytics response shapes", async () => {
		const source = await Bun.file("apps/bot-service/src/handlers/analytics.ts").text()
		expect(source).toContain("series")
		expect(source).toContain("dishes")
		expect(source).toContain("forecasts")
		expect(source).not.toContain("data.summary")
	})

	it("has no local markdown escaper left in any handler", async () => {
		for (const path of await handlerFiles()) {
			expect(await Bun.file(path).text()).not.toContain("const escapeMd")
		}
	})

	it("uses dayjs rather than new Date in every handler", async () => {
		for (const path of await handlerFiles()) {
			expect(await Bun.file(path).text()).not.toContain("new Date(")
		}
	})

	it("carries the agent's waste quantity into the disposition split, not a hardcoded zero", async () => {
		const source = await Bun.file("apps/bot-service/src/handlers/leftovers.ts").text()
		expect(source).toContain("wasteQty: data.suggestedWasteQty")
		expect(source).not.toContain("wasteQty: 0")
	})
})
