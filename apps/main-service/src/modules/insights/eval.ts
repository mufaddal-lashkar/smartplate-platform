import { and, eq, sql } from "drizzle-orm"
import { predictionScores, predictions } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"

const KIND = "reuse" as const

export type EvalInput = {
	periodStart: string
	periodEnd: string
	model: string
	promptVersion?: string
}

export const runEvalForTenant = async (
	ctx: SessionContext,
	input: EvalInput,
): Promise<{ written: number }> =>
	withTenant(ctx, async (tx) => {
		const forecastRows = await tx
			.select({
				restaurantId: predictions.restaurantId,
				payload: predictions.payload,
				promptVersion: predictions.promptVersion,
			})
			.from(predictions)
			.where(and(eq(predictions.kind, "prep_forecast"), eq(predictions.tenantId, ctx.tenantId)))

		const actuals = await tx.execute<{
			dish_id: string
			reused_kg: number
		}>(sql`
			with dish_outcomes as (
				select
					l.dish_id,
					coalesce(sum(coalesce(d.retain_qty, 0)), 0) as reused_kg
				from leftovers l
				left join leftover_dispositions d on d.leftover_id = l.id
				where l.service_date between ${input.periodStart} and ${input.periodEnd}
				group by l.dish_id
			)
			select dish_id, reused_kg from dish_outcomes
		`)

		const actualMap = new Map(actuals.map((row) => [row.dish_id, Number(row.reused_kg)]))

		let written = 0
		for (const row of forecastRows) {
			const payload = row.payload as {
				dishId?: string
				predictedQty?: number
				targetDate?: string
			}
			if (!payload.dishId) continue
			if (
				payload.targetDate &&
				(payload.targetDate < input.periodStart || payload.targetDate > input.periodEnd)
			) {
				continue
			}
			const predicted = Number(payload.predictedQty ?? 0)
			const actual = actualMap.get(payload.dishId) ?? 0
			const absError = Math.abs(predicted - actual)
			await tx.insert(predictionScores).values({
				tenantId: ctx.tenantId,
				restaurantId: row.restaurantId,
				kind: KIND,
				periodStart: input.periodStart,
				periodEnd: input.periodEnd,
				predictedValue: predicted.toFixed(3),
				actualValue: actual.toFixed(3),
				absError: absError.toFixed(3),
				model: input.model,
				promptVersion: row.promptVersion || input.promptVersion || "",
				source: "model",
			})
			written += 1
		}

		return { written }
	})
