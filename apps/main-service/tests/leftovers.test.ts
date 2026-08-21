import { describe, expect, test } from "bun:test"
import dayjs from "dayjs"
import { sql } from "drizzle-orm"
import { withTenant } from "../src/db/tx"
import {
	commitDispositions,
	listLeftovers,
	recordLeftover,
	suggestDisposition,
} from "../src/modules/leftovers/leftovers.service"
import { BIRYANI, insertDish, makeRestaurantTenant, testClock } from "./helpers/fixtures"

const PREPARED_AT = "2026-08-02T19:00:00Z"

describe("leftovers", () => {
	test("safe_until comes from shelf life and storage, never from the model", async () => {
		const ctx = await makeRestaurantTenant()
		const dishId = await insertDish(ctx, { ...BIRYANI, shelfLifeHours: 12 })

		const roomTemp = await recordLeftover(
			ctx,
			{ dishId, qty: 10, unit: "plate", storage: "room_temp", preparedAt: PREPARED_AT },
			testClock,
		)
		const chilled = await recordLeftover(
			ctx,
			{ dishId, qty: 10, unit: "plate", storage: "refrigerated", preparedAt: PREPARED_AT },
			testClock,
		)

		expect(dayjs(roomTemp.safeUntil).diff(dayjs(PREPARED_AT), "hour")).toBe(12)
		expect(dayjs(chilled.safeUntil).diff(dayjs(roomTemp.safeUntil), "hour")).toBe(24)
	})

	test("a split that does not total the leftover quantity is rejected", async () => {
		const ctx = await makeRestaurantTenant()
		const dishId = await insertDish(ctx, BIRYANI)
		const leftover = await recordLeftover(
			ctx,
			{ dishId, qty: 10, unit: "plate", storage: "room_temp", preparedAt: PREPARED_AT },
			testClock,
		)

		await expect(
			commitDispositions(
				ctx,
				{
					allocations: [
						{
							leftoverId: leftover.id,
							retainQty: 5,
							sellQty: 2,
							donateQty: 1,
							wasteQty: 0,
							sellPricePerUnit: 50,
						},
					],
				},
				testClock,
			),
		).rejects.toThrow()
	})

	test("one confirm creates one b2b listing and one ngo listing", async () => {
		const ctx = await makeRestaurantTenant()
		const dishId = await insertDish(ctx, BIRYANI)
		const rice = await recordLeftover(
			ctx,
			{ dishId, qty: 10, unit: "plate", storage: "refrigerated", preparedAt: PREPARED_AT },
			testClock,
		)
		const dal = await recordLeftover(
			ctx,
			{ dishId, qty: 6, unit: "plate", storage: "refrigerated", preparedAt: PREPARED_AT },
			testClock,
		)

		const { listings } = await commitDispositions(
			ctx,
			{
				allocations: [
					{
						leftoverId: rice.id,
						retainQty: 5,
						sellQty: 3,
						donateQty: 2,
						wasteQty: 0,
						sellPricePerUnit: 50,
					},
					{
						leftoverId: dal.id,
						retainQty: 2,
						sellQty: 2,
						donateQty: 2,
						wasteQty: 0,
						sellPricePerUnit: 40,
					},
				],
			},
			testClock,
		)

		expect(listings.filter((listing) => listing.channel === "b2b")).toHaveLength(1)
		expect(listings.filter((listing) => listing.channel === "ngo")).toHaveLength(1)
		expect(listings.find((listing) => listing.channel === "b2b")?.qty).toBe("5.000")
		expect(listings.find((listing) => listing.channel === "ngo")?.qty).toBe("4.000")
		expect(listings.find((listing) => listing.channel === "b2b")?.escalateAt).not.toBeNull()
	})

	test("a suggestion always totals the leftover and is persisted as a prediction", async () => {
		const ctx = await makeRestaurantTenant()
		const dishId = await insertDish(ctx, BIRYANI)
		const leftover = await recordLeftover(
			ctx,
			{ dishId, qty: 10, unit: "plate", storage: "refrigerated", preparedAt: PREPARED_AT },
			testClock,
		)

		const suggestion = await suggestDisposition(ctx, leftover.id, testClock)
		const total =
			suggestion.suggestedRetainQty +
			suggestion.suggestedSellQty +
			suggestion.suggestedDonateQty +
			suggestion.suggestedWasteQty

		expect(Math.abs(total - 10)).toBeLessThan(0.01)
		expect(suggestion.source).not.toBe("")

		const stored = await withTenant(ctx, async (tx) =>
			tx.execute(sql`
				select source from predictions where kind = 'reuse' and target_ref = ${leftover.id}
			`),
		)
		expect(stored).toHaveLength(1)
	})

	test("a failing allocation rolls the whole close back", async () => {
		const ctx = await makeRestaurantTenant()
		const dishId = await insertDish(ctx, BIRYANI)
		const good = await recordLeftover(
			ctx,
			{ dishId, qty: 10, unit: "plate", storage: "refrigerated", preparedAt: PREPARED_AT },
			testClock,
		)

		await expect(
			commitDispositions(
				ctx,
				{
					allocations: [
						{
							leftoverId: good.id,
							retainQty: 10,
							sellQty: 0,
							donateQty: 0,
							wasteQty: 0,
							sellPricePerUnit: 0,
						},
						{
							leftoverId: crypto.randomUUID(),
							retainQty: 1,
							sellQty: 0,
							donateQty: 0,
							wasteQty: 0,
							sellPricePerUnit: 0,
						},
					],
				},
				testClock,
			),
		).rejects.toThrow()

		const after = await listLeftovers(ctx, "2026-08-02")
		expect(after.find((leftover) => leftover.id === good.id)?.status).toBe("pending_disposition")
	})
})
