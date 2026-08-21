import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withTenant } from "../src/db/tx"
import { getDashboard, resolveRange } from "../src/modules/analytics/analytics.service"
import { fixedClock } from "../src/shared/clock"
import {
	BIRYANI,
	insertDish,
	insertDisposition,
	insertLeftover,
	insertOpenB2bListing,
	insertPrepEntry,
	makeRestaurantTenant,
	RICE_KG,
	seedKnownDay,
} from "./helpers/fixtures"

const DAY = "2026-08-01"
const RANGE = { from: "2026-08-01", to: "2026-08-02" }

describe("analytics", () => {
	test("the three rates come from prepared, leftover and binned quantities", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: DAY,
			prepared: 100,
			leftover: 20,
			reused: 8,
			sold: 6,
			donated: 4,
			binned: 2,
		})

		const dash = await getDashboard(ctx, RANGE)

		expect(dash.surplusRate).toBeCloseTo(0.2, 3)
		expect(dash.wasteRate).toBeCloseTo(0.02, 3)
		expect(dash.recoveryRate).toBeCloseTo(0.9, 3)
	})

	test("donated food is excluded from value recovered", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: DAY,
			prepared: 100,
			leftover: 20,
			reused: 0,
			sold: 0,
			donated: 20,
			binned: 0,
		})

		const dash = await getDashboard(ctx, RANGE)

		expect(dash.valueRecovered).toBe(0)
		expect(dash.recoveryRate).toBeCloseTo(1, 3)
	})

	test("a range with no service history returns zeroes, never NaN", async () => {
		const ctx = await makeRestaurantTenant()

		const dash = await getDashboard(ctx, { from: "2025-01-01", to: "2025-01-31" })

		expect(dash.surplusRate).toBe(0)
		expect(dash.wasteRate).toBe(0)
		expect(dash.recoveryRate).toBe(0)
		expect(dash.kgDiverted).toBe(0)
		expect(Number.isFinite(dash.surplusRate)).toBe(true)
		expect(Number.isFinite(dash.recoveryRate)).toBe(true)
	})

	test("a dish with no average serving weight is excluded from the rates", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: DAY,
			prepared: 100,
			leftover: 20,
			reused: 8,
			sold: 6,
			donated: 4,
			binned: 2,
		})

		const dishId = await insertDish(ctx, { ...BIRYANI, avgServingWeightG: 0 })
		const prepEntryId = await insertPrepEntry(ctx, {
			dishId,
			serviceDate: DAY,
			qtyPrepared: 60,
			qtyServed: 50,
		})
		const leftoverId = await insertLeftover(ctx, {
			dishId,
			serviceDate: DAY,
			qty: 10,
			unit: "plate",
			prepEntryId,
		})
		await insertDisposition(ctx, {
			leftoverId,
			retainQty: 0,
			sellQty: 0,
			donateQty: 0,
			wasteQty: 10,
			sellPricePerUnit: 0,
		})

		const dash = await getDashboard(ctx, RANGE)

		expect(dash.surplusRate).toBeCloseTo(0.2, 3)
		expect(dash.wasteRate).toBeCloseTo(0.02, 3)
		expect(dash.recoveryRate).toBeCloseTo(0.9, 3)
		expect(dash.unconvertibleQty).toBe(10)
	})

	test("only completed b2b listings count as sale proceeds", async () => {
		const ctx = await makeRestaurantTenant()
		const dishId = await insertDish(ctx, RICE_KG)
		const prepEntryId = await insertPrepEntry(ctx, {
			dishId,
			serviceDate: DAY,
			qtyPrepared: 100,
			qtyServed: 80,
		})
		const leftoverId = await insertLeftover(ctx, {
			dishId,
			serviceDate: DAY,
			qty: 20,
			unit: "kg",
			prepEntryId,
		})
		await insertDisposition(ctx, {
			leftoverId,
			retainQty: 0,
			sellQty: 20,
			donateQty: 0,
			wasteQty: 0,
			sellPricePerUnit: 50,
		})
		const listingId = await insertOpenB2bListing(ctx, { qty: 20, pricePerUnit: 50, leftoverId })

		const whileOpen = await getDashboard(ctx, RANGE)
		expect(whileOpen.valueRecovered).toBe(0)
		expect(whileOpen.openListings).toBe(1)

		await withTenant(ctx, async (tx) => {
			await tx.execute(sql`
				update surplus_listings set status = 'completed', completed_at = now()
				where id = ${listingId}
			`)
		})

		const afterPickup = await getDashboard(ctx, RANGE)
		expect(afterPickup.valueRecovered).toBe(1000)
		expect(afterPickup.openListings).toBe(0)
	})

	test("an absent range falls back to the last thirty days", () => {
		const range = resolveRange({ from: "", to: "" }, fixedClock("2026-08-02T12:00:00"))

		expect(range.to).toBe("2026-08-02")
		expect(range.from).toBe("2026-07-03")
	})
})
