import { describe, expect, test } from "bun:test"
import { escalateListing, listListings } from "../src/modules/listings/listings.service"
import {
	insertDish,
	insertLeftover,
	insertOpenB2bListing,
	insertPrepEntry,
	makeRestaurantTenant,
	type RestaurantContext,
	RICE_KG,
	testClock,
} from "./helpers/fixtures"

const SERVICE_DATE = "2026-08-02"

const seedOpenB2bListing = async (ctx: RestaurantContext): Promise<string> => {
	const dishId = await insertDish(ctx, RICE_KG)
	const prepEntryId = await insertPrepEntry(ctx, {
		dishId,
		serviceDate: SERVICE_DATE,
		qtyPrepared: 40,
		qtyServed: 30,
	})
	const leftoverId = await insertLeftover(ctx, {
		dishId,
		serviceDate: SERVICE_DATE,
		qty: 10,
		unit: "kg",
		prepEntryId,
	})

	return insertOpenB2bListing(ctx, { qty: 10, pricePerUnit: 50, leftoverId })
}

describe("listings", () => {
	test("escalation flips the channel to ngo, clears the price and logs an event", async () => {
		const ctx = await makeRestaurantTenant()
		const listingId = await seedOpenB2bListing(ctx)

		expect(await escalateListing(listingId, ctx.tenantId, testClock)).toBe(true)

		const [after] = await listListings(ctx)
		expect(after?.id).toBe(listingId)
		expect(after?.channel).toBe("ngo")
		expect(Number(after?.pricePerUnit)).toBe(0)
		expect(after?.escalateAt).toBeNull()
		expect(after?.events.map((event) => event.event)).toContain("escalated")
		expect(after?.items).toHaveLength(1)
	})

	test("escalating a listing that is no longer open is a no-op", async () => {
		const ctx = await makeRestaurantTenant()
		const listingId = await seedOpenB2bListing(ctx)

		expect(await escalateListing(listingId, ctx.tenantId, testClock)).toBe(true)
		expect(await escalateListing(listingId, ctx.tenantId, testClock)).toBe(false)
	})
})
