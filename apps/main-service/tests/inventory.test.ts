import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withTenant } from "../src/db/tx"
import { addLot, consumeLotsFefo } from "../src/shared/fefo"
import { makeRestaurantTenant, testClock } from "./helpers/fixtures"

const insertIngredient = async (
	ctx: { tenantId: string; restaurantId: string; userId: string },
	name: string,
	baseUnit: string,
): Promise<string> => {
	const fullCtx = { ...ctx, tenantType: "restaurant" as const, role: "owner" as const }
	return withTenant(fullCtx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into ingredients (tenant_id, restaurant_id, name, category, base_unit)
			values (${ctx.tenantId}, ${ctx.restaurantId}, ${name}, 'produce', ${baseUnit})
			returning id
		`)
		return String((rows[0] as { id: string }).id)
	})
}

const insertTenantWithRestaurant = async () => makeRestaurantTenant()

describe("FEFO consumption", () => {
	test("FEFO order expires earlier lots first", async () => {
		const ctx = await insertTenantWithRestaurant()
		const ingId = await insertIngredient(ctx, `Rice-${crypto.randomUUID().slice(0, 6)}`, "kg")

		const earlier = testClock.now().subtract(2, "day").toDate()
		const later = testClock.now().subtract(1, "day").toDate()

		const earlierLot = await withTenant(ctx, async (tx) =>
			addLot(tx, {
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				ingredientId: ingId,
				qtyPurchasedBase: 5,
				unitCost: 50,
				purchaseDate: testClock.now().subtract(3, "day").format("YYYY-MM-DD"),
				expiryDate: testClock.now().subtract(2, "day").format("YYYY-MM-DD"),
				occurredAt: earlier,
				reason: "use",
			}),
		)
		const laterLot = await withTenant(ctx, async (tx) =>
			addLot(tx, {
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				ingredientId: ingId,
				qtyPurchasedBase: 5,
				unitCost: 50,
				purchaseDate: testClock.now().subtract(1, "day").format("YYYY-MM-DD"),
				expiryDate: testClock.now().add(1, "day").format("YYYY-MM-DD"),
				occurredAt: later,
				reason: "use",
			}),
		)

		const result = await withTenant(ctx, async (tx) =>
			consumeLotsFefo(tx, {
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				ingredientId: ingId,
				qtyRequiredBase: 3,
				occurredAt: testClock.now().toDate(),
				reason: "use",
			}),
		)

		expect(result.movements.length).toBe(1)
		expect(result.movements[0]?.lotId).toBe(earlierLot.lotId)
		expect(result.movements[0]?.qtyDelta).toBe(-3)
		expect(laterLot.lotId).toBeDefined()
	})

	test("throws INSUFFICIENT_STOCK when there isn't enough", async () => {
		const ctx = await insertTenantWithRestaurant()
		const ingId = await insertIngredient(ctx, `Dal-${crypto.randomUUID().slice(0, 6)}`, "kg")

		await withTenant(ctx, async (tx) =>
			addLot(tx, {
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				ingredientId: ingId,
				qtyPurchasedBase: 2,
				unitCost: 100,
				purchaseDate: testClock.now().format("YYYY-MM-DD"),
				expiryDate: testClock.now().add(2, "day").format("YYYY-MM-DD"),
				occurredAt: testClock.now().toDate(),
				reason: "use",
			}),
		)

		await expect(
			withTenant(ctx, async (tx) =>
				consumeLotsFefo(tx, {
					tenantId: ctx.tenantId,
					restaurantId: ctx.restaurantId,
					ingredientId: ingId,
					qtyRequiredBase: 5,
					occurredAt: testClock.now().toDate(),
					reason: "use",
				}),
			),
		).rejects.toThrow(/Not enough stock/)
	})

	test("skips lots with zero remaining", async () => {
		const ctx = await insertTenantWithRestaurant()
		const ingId = await insertIngredient(ctx, `Onion-${crypto.randomUUID().slice(0, 6)}`, "kg")

		const emptyLot = await withTenant(ctx, async (tx) =>
			addLot(tx, {
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				ingredientId: ingId,
				qtyPurchasedBase: 4,
				unitCost: 30,
				purchaseDate: testClock.now().subtract(1, "day").format("YYYY-MM-DD"),
				expiryDate: testClock.now().add(1, "day").format("YYYY-MM-DD"),
				occurredAt: testClock.now().toDate(),
				reason: "use",
			}),
		)

		await withTenant(ctx, async (tx) => {
			const { adjustLot } = await import("../src/shared/fefo")
			await adjustLot(tx, {
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				lotId: emptyLot.lotId,
				ingredientId: ingId,
				qtyDeltaBase: -4,
				reason: "use",
				occurredAt: testClock.now().toDate(),
			})
		})

		await withTenant(ctx, async (tx) =>
			addLot(tx, {
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				ingredientId: ingId,
				qtyPurchasedBase: 2,
				unitCost: 30,
				purchaseDate: testClock.now().format("YYYY-MM-DD"),
				expiryDate: testClock.now().add(2, "day").format("YYYY-MM-DD"),
				occurredAt: testClock.now().toDate(),
				reason: "use",
			}),
		)

		const result = await withTenant(ctx, async (tx) =>
			consumeLotsFefo(tx, {
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				ingredientId: ingId,
				qtyRequiredBase: 1,
				occurredAt: testClock.now().toDate(),
				reason: "use",
			}),
		)

		expect(result.movements.length).toBe(1)
		expect(result.totalConsumed).toBe(1)
	})
})

describe("inventory module", () => {
	test("creating a supplier and listing them", async () => {
		const ctx = await insertTenantWithRestaurant()
		const { createSupplier, listSuppliers } = await import(
			"../src/modules/catalog/suppliers.service"
		)
		const created = await createSupplier(ctx, { name: "Acme Foods", contactName: "Jane" })
		expect(created.name).toBe("Acme Foods")
		const list = await listSuppliers(ctx)
		expect(list.map((s) => s.id)).toContain(created.id)
	})

	test("creating an ingredient validates baseUnit", async () => {
		const ctx = await insertTenantWithRestaurant()
		const { createIngredient } = await import("../src/modules/catalog/ingredients.service")
		const ok = await createIngredient(ctx, {
			name: "Salt",
			category: "spice",
			baseUnit: "g",
			pieceWeightG: 0,
		})
		expect(ok.baseUnit).toBe("g")

		const { ingredientInputSchema } = await import("../src/modules/catalog/ingredients.schema")
		const result = ingredientInputSchema.safeParse({
			name: "Eggs",
			category: "produce",
			baseUnit: "piece",
			pieceWeightG: 0,
		})
		expect(result.success).toBe(false)
	})

	test("recipe rejects unit mismatch", async () => {
		const ctx = await insertTenantWithRestaurant()
		const { createIngredient } = await import("../src/modules/catalog/ingredients.service")
		const ing = await createIngredient(ctx, {
			name: `Flour-${crypto.randomUUID().slice(0, 6)}`,
			category: "bakery",
			baseUnit: "g",
			pieceWeightG: 0,
		})
		const { setRecipe } = await import("../src/modules/catalog/dish-recipe.service")
		const { insertDish } = await import("./helpers/fixtures")
		const dishId = await insertDish(ctx, {
			name: "Roti",
			servingUnit: "piece",
			avgServingWeightG: 50,
			sellingPrice: 20,
			costPerUnit: 5,
			shelfLifeHours: 12,
			isReusable: false,
			reuseRoute: "",
		})
		await expect(
			setRecipe(ctx, dishId, { items: [{ ingredientId: ing.id, qtyPerServing: 50, unit: "kg" }] }),
		).rejects.toThrow(/base unit/)
	})
})
