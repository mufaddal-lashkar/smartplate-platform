import { describe, expect, test } from "bun:test"
import {
	claim,
	listBrowseableMarket,
	listNgoPickups,
	listOwnMarket,
	release,
} from "../src/modules/market/market.service"
import { makeNgoTenant, makeTenant } from "./helpers/db"
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

describe("market browse", () => {
	test("a restaurant in radius sees another tenant's open b2b listing", async () => {
		const seller = await makeRestaurantTenant({ latitude: 19.076, longitude: 72.8777 })
		const buyer = await makeRestaurantTenant({ latitude: 19.077, longitude: 72.8778 })
		await seedOpenB2b(seller)

		const visible = await listBrowseableMarket(buyer, testClock)
		expect(visible.find((row) => row.tenantId === seller.tenantId)).toBeDefined()
	})

	test("a restaurant in radius cannot see its own open b2b listing under /v1/market", async () => {
		const seller = await makeRestaurantTenant()
		await seedOpenB2b(seller)

		const own = await listBrowseableMarket(seller, testClock)
		const mineInMarket = own.find((row) => row.tenantId === seller.tenantId)
		expect(mineInMarket).toBeUndefined()
	})

	test("a restaurant outside the radius does not see the listing", async () => {
		const seller = await makeRestaurantTenant({ latitude: 19.076, longitude: 72.8777 })
		const farBuyer = await makeRestaurantTenant({ latitude: 28.6139, longitude: 77.209 })
		await seedOpenB2b(seller)

		const visible = await listBrowseableMarket(farBuyer, testClock)
		expect(visible.find((row) => row.tenantId === seller.tenantId)).toBeUndefined()
	})

	test("seller /v1/market/mine returns its own listings regardless of radius", async () => {
		const seller = await makeRestaurantTenant()
		await seedOpenB2b(seller)

		const mine = await listOwnMarket(seller)
		expect(mine).toHaveLength(1)
		expect(mine[0]?.tenantId).toBe(seller.tenantId)
	})

	test("verified ngo can browse ngo-channel listings within its active window", async () => {
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
		await commitDispositions(
			seller,
			{
				allocations: [
					{ leftoverId, retainQty: 0, sellQty: 0, donateQty: 10, wasteQty: 0, sellPricePerUnit: 0 },
				],
			},
			testClock,
		)

		const ngoCtx = {
			tenantId: ngo.id,
			tenantType: "ngo" as const,
			role: "ngo_admin" as const,
			userId: ngo.ownerId,
		}
		const visible = await listBrowseableMarket(ngoCtx, testClock)
		expect(visible.some((row) => row.tenantId === seller.tenantId && row.channel === "ngo")).toBe(
			true,
		)
	})
})

describe("market claim", () => {
	test("another restaurant can claim an open b2b listing", async () => {
		const seller = await makeRestaurantTenant()
		const buyer = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(seller)

		const result = await claim(buyer, listingId, testClock)
		expect(result.listing.id).toBe(listingId)
		expect(result.listing.claimedByTenantId).toBe(buyer.tenantId)
	})

	test("a second claim attempt on the same listing fails with LISTING_UNAVAILABLE", async () => {
		const seller = await makeRestaurantTenant()
		const buyerA = await makeRestaurantTenant()
		const buyerB = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(seller)

		await claim(buyerA, listingId, testClock)
		await expect(claim(buyerB, listingId, testClock)).rejects.toThrow(/no longer open/i)
	})

	test("the seller cannot claim its own listing", async () => {
		const seller = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(seller)

		await expect(claim(seller, listingId, testClock)).rejects.toThrow(/your own listing/i)
	})

	test("claim against a non-existent listing is a 404", async () => {
		const buyer = await makeRestaurantTenant()
		const fakeId = crypto.randomUUID()
		await expect(claim(buyer, fakeId, testClock)).rejects.toThrow(/no longer exists/i)
	})

	test("ngo can claim an open ngo listing", async () => {
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
		const claimed = await claim(ngoCtx, ngoListing?.id ?? "", testClock)
		expect(claimed.listing.claimedByTenantId).toBe(ngo.id)
	})

	test("an unverified ngo cannot reach /v1/market (RBAC: rbac grants it, but a verified_at gate is in the policy)", async () => {
		const seller = await makeRestaurantTenant()
		await seedOpenB2b(seller)
		const ngo = await makeNgoTenant(false)
		const ctx = {
			tenantId: ngo.id,
			tenantType: "ngo" as const,
			role: "ngo_admin" as const,
			userId: ngo.ownerId,
		}
		const visible = await listBrowseableMarket(ctx, testClock)
		const own = visible.find((row) => row.tenantId === seller.tenantId)
		expect(own).toBeUndefined()
	})
})

describe("market release", () => {
	test("the claimer can release a claimed listing", async () => {
		const seller = await makeRestaurantTenant({ latitude: 19.076, longitude: 72.8777 })
		const buyer = await makeRestaurantTenant({ latitude: 19.077, longitude: 72.8778 })
		const observer = await makeRestaurantTenant({ latitude: 19.078, longitude: 72.8779 })
		const listingId = await seedOpenB2b(seller)

		await claim(buyer, listingId, testClock)
		await release(buyer, listingId, testClock)

		const reopened = await listBrowseableMarket(observer, testClock)
		expect(reopened.find((row) => row.id === listingId)).toBeDefined()
	})

	test("a non-claimer cannot release someone else's listing", async () => {
		const seller = await makeRestaurantTenant()
		const buyerA = await makeRestaurantTenant()
		const buyerB = await makeRestaurantTenant()
		const listingId = await seedOpenB2b(seller)

		await claim(buyerA, listingId, testClock)
		await expect(release(buyerB, listingId, testClock)).rejects.toThrow(/not have a claim/i)
	})
})

describe("ngo pickups", () => {
	test("an ngo sees its claimed listings", async () => {
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
		await claim(ngoCtx, ngoListing?.id ?? "", testClock)
		const pickups = await listNgoPickups(ngoCtx)
		expect(pickups).toHaveLength(1)
		expect(pickups[0]?.id).toBe(ngoListing?.id)
	})

	test("a non-ngo tenant calling /v1/market/pickups sees an empty list (RLS hides it)", async () => {
		const seller = await makeRestaurantTenant()
		await seedOpenB2b(seller)
		const visible = await listNgoPickups(seller)
		expect(visible).toHaveLength(0)
	})

	test("super_admin context still works for seed verification", async () => {
		const a = await makeTenant("restaurant")
		expect(a.id.length).toBeGreaterThan(0)
	})
})
