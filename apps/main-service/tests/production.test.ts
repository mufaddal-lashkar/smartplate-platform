import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withTenant } from "../src/db/tx"
import { createDish } from "../src/modules/catalog/catalog.service"
import { setRecipe } from "../src/modules/catalog/dish-recipe.service"
import { createIngredient } from "../src/modules/catalog/ingredients.service"
import {
	createPrepEntry,
	getPrepEntry,
	listPrepEntriesForDate,
	patchPrepEntry,
	recordReuseConfirmation,
} from "../src/modules/production/production.service"
import { ApiError } from "../src/shared/api-error"
import { BIRYANI, insertPrepEntry, makeRestaurantTenant, testClock } from "./helpers/fixtures"

const insertLeftover = async (
	ctx: { tenantId: string; restaurantId: string; userId: string },
	dishId: string,
	prepEntryId: string,
): Promise<string> => {
	return withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into leftovers (
				tenant_id, restaurant_id, dish_id, prep_entry_id, service_date,
				qty, unit, storage, prepared_at, safe_until, status
			) values (
				${ctx.tenantId}, ${ctx.restaurantId}, ${dishId}, ${prepEntryId},
				'2026-08-02', 2, 'plate'::serving_unit, 'refrigerated',
				'2026-08-02T20:00:00Z'::timestamptz,
				'2026-08-05T20:00:00Z'::timestamptz, 'awaiting_reuse'
			) returning id
		`)
		return String((rows[0] as { id: string }).id)
	})
}

const insertDispositionRetain = async (
	ctx: { tenantId: string; restaurantId: string; userId: string },
	leftoverId: string,
	retainQty: number,
): Promise<void> => {
	await withTenant(ctx, async (tx) => {
		await tx.execute(sql`
			insert into leftover_dispositions (
				tenant_id, leftover_id, retain_qty, sell_qty, donate_qty, waste_qty,
				sell_price_per_unit, ai_suggested_retain_qty, decided_by_user_id, decided_at
			) values (
				${ctx.tenantId}, ${leftoverId}, ${retainQty}, 0, 0, 0, 0, ${retainQty},
				${ctx.userId}, now()
			)
		`)
	})
}

describe("prep entries", () => {
	test("create + patch a prep entry", async () => {
		const ctx = await makeRestaurantTenant()
		const dish = await createDish(ctx, { ...BIRYANI, name: "Test Dish" }, testClock)
		const ingredient = await createIngredient(ctx, {
			name: "Basmati",
			category: "grain",
			baseUnit: "g",
			pieceWeightG: 0,
		})
		await setRecipe(ctx, dish.id, {
			items: [{ ingredientId: ingredient.id, qtyPerServing: 200, unit: "g" }],
		})

		await withTenant(ctx, async (tx) => {
			await tx.execute(sql`
				insert into inventory_lots (
					tenant_id, restaurant_id, ingredient_id, qty_purchased_base, qty_remaining_base,
					unit_cost, purchase_date, expiry_date
				) values (
					${ctx.tenantId}, ${ctx.restaurantId}, ${ingredient.id}, 5000, 5000,
					10, '2026-08-01', '2026-09-01'
				)
			`)
		})

		const prep = await createPrepEntry(
			ctx,
			{
				dishId: dish.id,
				serviceDate: "2026-08-02",
				mealPeriod: "dinner",
				qtyPrepared: 5,
				covers: 5,
			},
			testClock,
		)
		expect(Number(prep.qtyPrepared)).toBeCloseTo(5, 3)

		const updated = await patchPrepEntry(ctx, prep.id, { qtyServed: 4, covers: 4 })
		expect(Number(updated.qtyServed)).toBeCloseTo(4, 3)

		const list = await listPrepEntriesForDate(ctx, "2026-08-02")
		expect(list.find((p) => p.id === prep.id)).toBeDefined()

		const fetched = await getPrepEntry(ctx, prep.id)
		expect(fetched.dishName).toBe("Test Dish")
	})

	test("prep entry without a recipe is rejected", async () => {
		const ctx = await makeRestaurantTenant()
		const dish = await createDish(ctx, { ...BIRYANI, name: "No Recipe Dish" }, testClock)

		await expect(
			createPrepEntry(
				ctx,
				{
					dishId: dish.id,
					serviceDate: "2026-08-02",
					mealPeriod: "lunch",
					qtyPrepared: 1,
					covers: 1,
				},
				testClock,
			),
		).rejects.toThrow(/Add a recipe/)
	})

	test("prep entry fails when there is no stock", async () => {
		const ctx = await makeRestaurantTenant()
		const dish = await createDish(ctx, { ...BIRYANI, name: "Starve Dish" }, testClock)
		const ingredient = await createIngredient(ctx, {
			name: "Salt",
			category: "spice",
			baseUnit: "g",
			pieceWeightG: 0,
		})
		await setRecipe(ctx, dish.id, {
			items: [{ ingredientId: ingredient.id, qtyPerServing: 100, unit: "g" }],
		})

		await expect(
			createPrepEntry(
				ctx,
				{
					dishId: dish.id,
					serviceDate: "2026-08-02",
					mealPeriod: "dinner",
					qtyPrepared: 5,
					covers: 5,
				},
				testClock,
			),
		).rejects.toBeInstanceOf(ApiError)
	})
})

describe("reuse confirmation", () => {
	test("recording confirmation updates status and history", async () => {
		const ctx = await makeRestaurantTenant()
		const dish = await createDish(ctx, { ...BIRYANI, name: "Reuse Dish" }, testClock)
		const prepEntryId = await insertPrepEntry(ctx, {
			dishId: dish.id,
			serviceDate: "2026-08-02",
			qtyPrepared: 5,
			qtyServed: 3,
		})
		const leftoverId = await insertLeftover(ctx, dish.id, prepEntryId)
		await insertDispositionRetain(ctx, leftoverId, 2)

		const result = await recordReuseConfirmation(
			ctx,
			leftoverId,
			{ confirmedReusedQty: 2, notes: "Sent to shelter." },
			testClock,
		)
		expect(result.newStatus).toBe("closed")
		expect(Number(result.confirmation.confirmedReusedQty)).toBeCloseTo(2, 3)
	})

	test("throws REUSE_EXCEEDS_RETAIN when confirmed > retained", async () => {
		const ctx = await makeRestaurantTenant()
		const dish = await createDish(ctx, { ...BIRYANI, name: "Reuse Limit Dish" }, testClock)
		const prepEntryId = await insertPrepEntry(ctx, {
			dishId: dish.id,
			serviceDate: "2026-08-02",
			qtyPrepared: 5,
			qtyServed: 3,
		})
		const leftoverId = await insertLeftover(ctx, dish.id, prepEntryId)
		await insertDispositionRetain(ctx, leftoverId, 1)

		await expect(
			recordReuseConfirmation(ctx, leftoverId, { confirmedReusedQty: 5, notes: "" }, testClock),
		).rejects.toThrow(/Only 1.000/)
	})

	test("partial confirmation keeps leftover awaiting reuse", async () => {
		const ctx = await makeRestaurantTenant()
		const dish = await createDish(ctx, { ...BIRYANI, name: "Partial Reuse" }, testClock)
		const prepEntryId = await insertPrepEntry(ctx, {
			dishId: dish.id,
			serviceDate: "2026-08-02",
			qtyPrepared: 5,
			qtyServed: 1,
		})
		const leftoverId = await insertLeftover(ctx, dish.id, prepEntryId)
		await insertDispositionRetain(ctx, leftoverId, 4)

		const result = await recordReuseConfirmation(
			ctx,
			leftoverId,
			{ confirmedReusedQty: 2, notes: "first batch" },
			testClock,
		)
		expect(result.newStatus).toBe("awaiting_reuse")
	})
})
