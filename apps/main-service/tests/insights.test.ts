import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { predictionScores } from "../src/db/schema"
import { withSystem, withTenant } from "../src/db/tx"
import { runEvalForTenant } from "../src/modules/insights/eval"
import { readLatestInsight, requireInsightOrThrow } from "../src/modules/insights/insights.service"
import { ApiError } from "../src/shared/api-error"
import { makeRestaurantTenant, seedKnownDay } from "./helpers/fixtures"

const cleanPredictionScores = async () => {
	await withSystem(async (tx) => {
		await tx.execute(sql`delete from prediction_scores`)
	})
}

const expectApiError = async (fn: () => Promise<unknown>): Promise<ApiError> => {
	try {
		await fn()
	} catch (e) {
		expect(e).toBeInstanceOf(ApiError)
		return e as ApiError
	}
	throw new Error("expected function to throw")
}

describe("insights", () => {
	beforeAll(async () => {
		await cleanPredictionScores()
	})

	afterAll(async () => {
		await cleanPredictionScores()
	})

	test("returns 503 when no prediction_scores rows exist", async () => {
		const ctx = await makeRestaurantTenant()
		await expectApiError(() => requireInsightOrThrow(ctx))
	})

	test("returns null when the latest row has abs_error above the threshold", async () => {
		const ctx = await makeRestaurantTenant()
		await withTenant(ctx, async (tx) => {
			await tx.insert(predictionScores).values({
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				kind: "reuse",
				periodStart: "2026-08-01",
				periodEnd: "2026-08-07",
				predictedValue: "10.000",
				actualValue: "5.000",
				absError: "5.000",
				model: "test",
				promptVersion: "",
				source: "model",
			})
		})

		const insight = await readLatestInsight(ctx)
		expect(insight).toBeNull()
	})

	test("returns the score when abs_error is below the threshold", async () => {
		const ctx = await makeRestaurantTenant()
		await withTenant(ctx, async (tx) => {
			await tx.insert(predictionScores).values({
				tenantId: ctx.tenantId,
				restaurantId: ctx.restaurantId,
				kind: "reuse",
				periodStart: "2026-08-01",
				periodEnd: "2026-08-07",
				predictedValue: "10.000",
				actualValue: "9.900",
				absError: "0.100",
				model: "test",
				promptVersion: "",
				source: "model",
			})
		})

		const insight = await readLatestInsight(ctx)
		expect(insight).not.toBeNull()
		expect(insight?.score.absError).toBe(0.1)
		expect(insight?.score.kind).toBe("reuse")
	})

	test("runEvalForTenant writes a prediction_score row from a forecast + actual", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: "2026-08-01",
			prepared: 100,
			leftover: 20,
			reused: 10,
			sold: 0,
			donated: 0,
			binned: 10,
		})

		const dishId = await withTenant(ctx, async (tx) => {
			const rows = await tx.execute(sql`select id from dishes limit 1`)
			return String(rows[0]?.id)
		})

		await withTenant(ctx, async (tx) => {
			await tx.execute(sql`
				insert into predictions (tenant_id, restaurant_id, kind, target_ref, payload, model, source)
				values (
					${ctx.tenantId}, ${ctx.restaurantId}, 'prep_forecast', ${dishId},
					${JSON.stringify({
						dishId,
						dishName: "Test",
						predictedQty: 10,
						confidence: 0.9,
						targetDate: "2026-08-01",
					})}::jsonb,
					'test-model', 'model'
				)
			`)
		})

		const { written } = await runEvalForTenant(ctx, {
			periodStart: "2026-08-01",
			periodEnd: "2026-08-07",
			model: "test-model",
		})

		expect(written).toBeGreaterThan(0)

		const insight = await readLatestInsight(ctx)
		expect(insight).not.toBeNull()
		expect(insight?.score.absError).toBeLessThan(0.15)
	})
})
