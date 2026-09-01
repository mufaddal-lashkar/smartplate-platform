import { describe, expect, test } from "bun:test"
import {
	cancelOwnListing,
	completeOwnListing,
	patchListing,
	reportNoShow,
} from "../src/modules/listings/listings.service"
import { makeNgoTenant } from "./helpers/db"
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

const seedOpenB2b = async (ctx: RestaurantContext): Promise<string> => {
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

describe("listing patch", () => {
	test("owner can change price", async () => {
		const ctx = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(ctx)
		await patchListing(ctx, listingId, { pricePerUnit: "75.00" }, testClock)

		const { listListings } = await import("../src/modules/listings/listings.service")
		const [after] = await listListings(ctx)
		expect(Number(after?.pricePerUnit)).toBe(75)
	})

	test("owner can extend pickup window", async () => {
		const ctx = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(ctx)
		const future = new Date("2026-12-01T20:00:00Z")
		await patchListing(ctx, listingId, { pickupUntil: future }, testClock)

		const { listListings } = await import("../src/modules/listings/listings.service")
		const [after] = await listListings(ctx)
		expect(after?.pickupUntil.toISOString()).toBe(future.toISOString())
	})

	test("patching nothing throws VALIDATION_FAILED", async () => {
		const ctx = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(ctx)
		await expect(patchListing(ctx, listingId, {}, testClock)).rejects.toThrow(
			/pricePerUnit or pickupUntil/i,
		)
	})

	test("patching another tenant's listing is a 404", async () => {
		const seller = await makeRestaurantTenant()
		const other = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(seller)
		await expect(
			patchListing(other, listingId, { pricePerUnit: "100" }, testClock),
		).rejects.toThrow(/cannot be edited/i)
	})
})

describe("listing cancel", () => {
	test("owner can cancel an open listing", async () => {
		const ctx = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(ctx)
		await cancelOwnListing(ctx, listingId, testClock)

		const { listListings } = await import("../src/modules/listings/listings.service")
		const [after] = await listListings(ctx)
		expect(after?.status).toBe("cancelled")
	})

	test("cancel on a completed listing is a 404", async () => {
		const ctx = await makeRestaurantTenant()
		const buyer = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(ctx)
		const { claim } = await import("../src/modules/market/market.service")
		await claim(buyer, listingId, testClock)
		await completeOwnListing(ctx, listingId, testClock)
		await expect(cancelOwnListing(ctx, listingId, testClock)).rejects.toThrow(
			/cannot be cancelled/i,
		)
	})
})

describe("listing complete", () => {
	test("owner can complete a claimed listing", async () => {
		const seller = await makeRestaurantTenant()
		const buyer = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(seller)
		const { claim } = await import("../src/modules/market/market.service")
		await claim(buyer, listingId, testClock)

		await completeOwnListing(seller, listingId, testClock)
		const { listListings } = await import("../src/modules/listings/listings.service")
		const [after] = await listListings(seller)
		expect(after?.status).toBe("completed")
		expect(after?.completedAt).not.toBeNull()
	})

	test("ngo can complete its own claimed ngo listing", async () => {
		const seller = await makeRestaurantTenant()
		const ngo = await makeNgoTenant(true)
		const dishId = await insertDish(seller, RICE_KG)
		const prepEntryId = await insertPrepEntry(seller, {
			dishId,
			serviceDate: SERVICE_DATE,
			qtyPrepared: 40,
			qtyServed: 30,
		})
		const leftoverId = await insertLeftover(seller, {
			dishId,
			serviceDate: SERVICE_DATE,
			qty: 10,
			unit: "kg",
			prepEntryId,
		})

		const { commitDispositions } = await import("../src/modules/leftovers/leftovers.service")
		const result = await commitDispositions(
			seller,
			{
				allocations: [
					{ leftoverId, retainQty: 0, sellQty: 0, donateQty: 10, wasteQty: 0, sellPricePerUnit: 0 },
				],
			},
			testClock,
		)
		const ngoListing = result.listings.find((l) => l.channel === "ngo")
		expect(ngoListing).toBeDefined()

		const ngoCtx = {
			tenantId: ngo.id,
			tenantType: "ngo" as const,
			role: "ngo_admin" as const,
			userId: ngo.ownerId,
		}
		const { claim } = await import("../src/modules/market/market.service")
		await claim(ngoCtx, ngoListing?.id ?? "", testClock)
		await completeOwnListing(ngoCtx, ngoListing?.id ?? "", testClock)

		const { listListings: ls } = await import("../src/modules/listings/listings.service")
		const [after] = await ls(seller)
		expect(after?.status).toBe("completed")
	})
})

describe("listing no-show", () => {
	test("owner can report no-show and the listing reverts to open", async () => {
		const seller = await makeRestaurantTenant()
		const buyer = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(seller)
		const { claim, listBrowseableMarket } = await import("../src/modules/market/market.service")
		await claim(buyer, listingId, testClock)

		await reportNoShow(seller, listingId, testClock)
		const { listListings } = await import("../src/modules/listings/listings.service")
		const [after] = await listListings(seller)
		expect(after?.status).toBe("open")
		expect(after?.claimedByTenantId).toBeNull()

		const reopened = await listBrowseableMarket(buyer, testClock)
		expect(reopened.find((row) => row.id === listingId)).toBeDefined()
	})

	test("reporting no-show on an open listing is a 404", async () => {
		const ctx = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(ctx)
		await expect(reportNoShow(ctx, listingId, testClock)).rejects.toThrow(/not claimed/i)
	})
})
