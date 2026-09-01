import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withTenant } from "../src/db/tx"
import {
	loadDishRecovery,
	loadForecasts,
	loadRecoverySeries,
	loadWasteSeries,
} from "../src/modules/analytics/analytics.queries"
import { makeRestaurantTenant, seedKnownDay } from "./helpers/fixtures"

const RANGE = { from: "2026-08-01", to: "2026-08-02" }

describe("analytics.queries", () => {
	test("loadWasteSeries returns surplus and waste per day", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: "2026-08-01",
			prepared: 100,
			leftover: 20,
			reused: 8,
			sold: 6,
			donated: 4,
			binned: 2,
		})

		const series = await loadWasteSeries(ctx, RANGE, "day")

		const day = series.find((s) => s.bucket === "2026-08-01")
		expect(day).toBeDefined()
		expect(day?.wasteKg).toBeCloseTo(2, 6)
		expect(day?.surplusKg).toBeCloseTo(18, 6)
	})

	test("loadRecoverySeries returns reused/sold/donated per day", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: "2026-08-01",
			prepared: 100,
			leftover: 20,
			reused: 8,
			sold: 6,
			donated: 4,
			binned: 2,
		})

		const series = await loadRecoverySeries(ctx, RANGE, "day")

		const day = series.find((s) => s.bucket === "2026-08-01")
		expect(day).toBeDefined()
		expect(day?.reusedKg).toBeCloseTo(8, 6)
		expect(day?.soldKg).toBeCloseTo(6, 6)
		expect(day?.donatedKg).toBeCloseTo(4, 6)
		expect(day?.totalRecoveredKg).toBeCloseTo(18, 6)
		expect(day?.recoveryRate).toBeCloseTo(0.9, 4)
	})

	test("loadDishRecovery returns per-dish breakdown", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: "2026-08-01",
			prepared: 100,
			leftover: 20,
			reused: 8,
			sold: 6,
			donated: 4,
			binned: 2,
		})

		const dishes = await loadDishRecovery(ctx, RANGE)

		const dish = dishes.find((d) => d.prepared > 0)
		expect(dish).toBeDefined()
		expect(dish?.preparedKg).toBeCloseTo(100, 6)
		expect(dish?.leftoverKg).toBeCloseTo(20, 6)
		expect(dish?.reusedKg).toBeCloseTo(8, 6)
		expect(dish?.soldKg).toBeCloseTo(6, 6)
		expect(dish?.donatedKg).toBeCloseTo(4, 6)
		expect(dish?.wastedKg).toBeCloseTo(2, 6)
		expect(dish?.recoveryRate).toBeCloseTo(0.9, 4)
	})

	test("loadForecasts returns rows from predictions table", async () => {
		const ctx = await makeRestaurantTenant()
		const dishId = "11111111-1111-1111-1111-111111111111"

		await withTenant(ctx, async (tx) => {
			await tx.execute(sql`
				insert into predictions (tenant_id, restaurant_id, kind, target_ref, payload, model, source)
				values (
					${ctx.tenantId}, ${ctx.restaurantId}, 'prep_forecast', ${dishId},
					${JSON.stringify({
						dishId,
						dishName: "Forecast Dish",
						predictedQty: 12.5,
						confidence: 0.8,
						targetDate: "2026-08-01",
					})}::jsonb,
					'test-model', 'model'
				)
			`)
		})

		const forecasts = await loadForecasts(ctx, RANGE)

		expect(forecasts.length).toBe(1)
		expect(forecasts[0]?.dishId).toBe(dishId)
		expect(forecasts[0]?.predictedQty).toBe(12.5)
		expect(forecasts[0]?.confidence).toBe(0.8)
	})

	test("loadForecasts filters by target date", async () => {
		const ctx = await makeRestaurantTenant()
		const dishId = "22222222-2222-2222-2222-222222222222"

		await withTenant(ctx, async (tx) => {
			await tx.execute(sql`
				insert into predictions (tenant_id, restaurant_id, kind, target_ref, payload, model, source)
				values (
					${ctx.tenantId}, ${ctx.restaurantId}, 'prep_forecast', ${dishId},
					${JSON.stringify({
						dishId,
						dishName: "Old Forecast",
						predictedQty: 5,
						confidence: 0.5,
						targetDate: "2025-01-01",
					})}::jsonb,
					'test-model', 'model'
				)
			`)
		})

		const forecasts = await loadForecasts(ctx, RANGE)

		expect(forecasts.length).toBe(0)
	})
})
