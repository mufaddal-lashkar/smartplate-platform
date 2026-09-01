import { and, desc, eq } from "drizzle-orm"
import { predictionScores } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"

const EVAL_THRESHOLD = 0.15
const KIND = "reuse" as const

export type InsightItem = {
	dishId: string
	dishName: string
	predictedQty: number
	confidence: number
}

export type InsightsResponse = {
	insights: InsightItem[]
	score: {
		kind: typeof KIND
		periodStart: string
		periodEnd: string
		predictedValue: number
		actualValue: number
		absError: number
		model: string
	}
}

export const readLatestInsight = async (ctx: SessionContext): Promise<InsightsResponse | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				periodStart: predictionScores.periodStart,
				periodEnd: predictionScores.periodEnd,
				predictedValue: predictionScores.predictedValue,
				actualValue: predictionScores.actualValue,
				absError: predictionScores.absError,
				model: predictionScores.model,
			})
			.from(predictionScores)
			.where(and(eq(predictionScores.kind, KIND), eq(predictionScores.tenantId, ctx.tenantId)))
			.orderBy(desc(predictionScores.periodEnd))
			.limit(1)
		const row = rows[0]
		if (row == null) return null
		const absError = Number(row.absError)
		if (absError > EVAL_THRESHOLD) return null
		return {
			insights: [],
			score: {
				kind: KIND,
				periodStart: String(row.periodStart),
				periodEnd: String(row.periodEnd),
				predictedValue: Number(row.predictedValue),
				actualValue: Number(row.actualValue),
				absError,
				model: row.model,
			},
		}
	})

export const requireInsightOrThrow = async (ctx: SessionContext): Promise<InsightsResponse> => {
	const insight = await readLatestInsight(ctx)
	if (insight == null) {
		throw new ApiError(
			"AI_UNAVAILABLE",
			"Insights require the agent compute service, which is not yet deployed.",
		)
	}
	return insight
}
