import { describe, expect, test } from "bun:test"
import type { DishInput } from "../src/modules/catalog/catalog.schema"
import {
	archiveDish,
	createDish,
	listDishes,
	updateDish,
} from "../src/modules/catalog/catalog.service"
import { BIRYANI, makeRestaurantTenant, testClock } from "./helpers/fixtures"

const DISH: DishInput = { ...BIRYANI, category: "rice" }

describe("dish catalog", () => {
	test("creates and lists a dish", async () => {
		const ctx = await makeRestaurantTenant()
		const created = await createDish(ctx, DISH, testClock)

		expect(created.name).toBe("Veg Biryani")
		expect(created.restaurantId).toBe(ctx.restaurantId)

		const all = await listDishes(ctx)
		expect(all.map((dish) => dish.id)).toContain(created.id)
	})

	test("archived dishes disappear from the list", async () => {
		const ctx = await makeRestaurantTenant()
		const created = await createDish(ctx, { ...DISH, name: "Dal Tadka" }, testClock)

		await archiveDish(ctx, created.id, testClock)

		const all = await listDishes(ctx)
		expect(all.map((dish) => dish.id)).not.toContain(created.id)
	})

	test("a dish sold by plate must declare an average serving weight", async () => {
		const ctx = await makeRestaurantTenant()

		await expect(createDish(ctx, { ...DISH, avgServingWeightG: 0 }, testClock)).rejects.toThrow()

		const byWeight = await createDish(
			ctx,
			{ ...DISH, name: "Steamed Rice", servingUnit: "kg", avgServingWeightG: 0 },
			testClock,
		)
		expect(byWeight.avgServingWeightG).toBeNull()
	})

	test("another tenant cannot update this tenant's dish", async () => {
		const owner = await makeRestaurantTenant()
		const other = await makeRestaurantTenant()
		const created = await createDish(owner, DISH, testClock)

		await expect(updateDish(other, created.id, { ...DISH, name: "Hijacked" })).rejects.toThrow(
			"That dish is no longer on your menu.",
		)

		const stillOurs = await listDishes(owner)
		expect(stillOurs.find((dish) => dish.id === created.id)?.name).toBe("Veg Biryani")
	})
})
