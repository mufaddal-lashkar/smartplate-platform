import { and, eq, gte, lte, sql } from "drizzle-orm"
import {
	dishes,
	leftoverDispositions,
	leftovers,
	listingItems,
	predictions,
	prepEntries,
	surplusListings,
} from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"
import { type DateGrain, dateTrunc } from "../../shared/date-grain"

export type DateRange = {
	from: string
	to: string
}

export type DishUnit = {
	servingUnit: typeof dishes.$inferSelect.servingUnit
	avgServingWeightG: number
	costPerUnit: number
}

export type PreparedTotals = DishUnit & {
	prepared: number
}

export type OutcomeTotals = DishUnit & {
	leftover: number
	reused: number
	sold: number
	donated: number
	binned: number
}

export type DashboardTotals = {
	prepared: PreparedTotals[]
	outcomes: OutcomeTotals[]
	b2bProceeds: number
	pendingLeftovers: number
	openListings: number
}

export type DishRecovery = {
	dishId: string
	name: string
	servingUnit: typeof dishes.$inferSelect.servingUnit
	prepared: number
	leftover: number
	reused: number
	sold: number
	donated: number
	wasted: number
	preparedKg: number
	leftoverKg: number
	reusedKg: number
	soldKg: number
	donatedKg: number
	wastedKg: number
	recoveryRate: number
}

export type WasteBucket = {
	bucket: string
	surplusKg: number
	wasteKg: number
}

export type RecoveryBucket = {
	bucket: string
	reusedKg: number
	soldKg: number
	donatedKg: number
	totalRecoveredKg: number
	recoveryRate: number
}

export type Forecast = {
	dishId: string
	dishName: string
	predictedQty: number
	confidence: number
	source: string
}

const toNumber = (value: string | null): number => (value == null ? 0 : Number(value))

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value))

const eachDay = (from: string, to: string): string[] => {
	const start = new Date(`${from}T00:00:00Z`)
	const end = new Date(`${to}T00:00:00Z`)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [from, to]
	if (start.getTime() > end.getTime()) return []
	const out: string[] = []
	for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
		const d = new Date(t)
		out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`)
	}
	return out
}

const eachWeek = (from: string, to: string): string[] => {
	const start = new Date(`${from}T00:00:00Z`)
	const end = new Date(`${to}T00:00:00Z`)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
	if (start.getTime() > end.getTime()) return []
	const out: string[] = []
	const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
	const day = cursor.getUTCDay()
	cursor.setUTCDate(cursor.getUTCDate() - day)
	while (cursor.getTime() <= end.getTime()) {
		out.push(
			`${cursor.getUTCFullYear()}-${pad2(cursor.getUTCMonth() + 1)}-${pad2(cursor.getUTCDate())}`,
		)
		cursor.setUTCDate(cursor.getUTCDate() + 7)
	}
	return out
}

const eachMonth = (from: string, to: string): string[] => {
	const start = new Date(`${from}T00:00:00Z`)
	const end = new Date(`${to}T00:00:00Z`)
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
	if (start.getTime() > end.getTime()) return []
	const out: string[] = []
	const startMonth = start.getUTCMonth() + 1
	const startYear = start.getUTCFullYear()
	const endMonth = end.getUTCMonth() + 1
	const endYear = end.getUTCFullYear()
	for (let y = startYear; y <= endYear; y += 1) {
		const m0 = y === startYear ? startMonth : 1
		const m1 = y === endYear ? endMonth : 12
		for (let m = m0; m <= m1; m += 1) {
			out.push(`${y}-${pad2(m)}-01`)
		}
	}
	return out
}

export const zeroFillBuckets = <T extends { bucket: string }>(
	rows: T[],
	range: DateRange,
	grain: DateGrain,
): T[] => {
	const byKey = new Map(rows.map((row) => [row.bucket, row]))
	const keys =
		grain === "day"
			? eachDay(range.from, range.to)
			: grain === "week"
				? eachWeek(range.from, range.to)
				: eachMonth(range.from, range.to)
	if (keys.length === 0) {
		return [...rows].sort((a, b) => a.bucket.localeCompare(b.bucket))
	}
	const template = rows[0]
	if (!template) {
		return keys.map((bucket) => ({ bucket }) as T)
	}
	return keys.map((bucket) => {
		const hit = byKey.get(bucket)
		if (hit) return hit
		return { ...template, bucket }
	})
}

const inRange = (
	column: typeof prepEntries.serviceDate | typeof leftovers.serviceDate,
	range: DateRange,
) => and(gte(column, range.from), lte(column, range.to))

const grainBucket = (grain: DateGrain, column: typeof prepEntries.preparedAt) => {
	const fragment = dateTrunc(grain, sql`${column}::timestamptz`)
	return sql<string>`to_char(${fragment}, 'YYYY-MM-DD')`
}

export const loadPreparedKgSeries = async (
	ctx: SessionContext,
	range: DateRange,
	grain: DateGrain,
): Promise<{ bucket: string; preparedKg: number }[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				bucket: grainBucket(grain, prepEntries.preparedAt),
				preparedKg: sql<string>`
					coalesce(sum(
						${prepEntries.qtyPrepared} *
						case
							when ${dishes.servingUnit} = 'kg' then 1
							when ${dishes.avgServingWeightG} is not null and ${dishes.avgServingWeightG} > 0
								then ${dishes.avgServingWeightG} / 1000.0
							else 0
						end
					), 0)
				`,
			})
			.from(prepEntries)
			.innerJoin(dishes, eq(dishes.id, prepEntries.dishId))
			.where(inRange(prepEntries.serviceDate, range))
			.groupBy(grainBucket(grain, prepEntries.preparedAt))
		return rows.map((row) => ({
			bucket: row.bucket,
			preparedKg: toNumber(row.preparedKg),
		}))
	})

export const loadOutcomeSeries = async (
	ctx: SessionContext,
	range: DateRange,
	grain: DateGrain,
): Promise<
	{
		bucket: string
		leftoverKg: number
		reusedKg: number
		soldKg: number
		donatedKg: number
		binnedKg: number
	}[]
> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				bucket: grainBucket(grain, leftovers.preparedAt),
				leftoverKg: sql<string>`
					coalesce(sum(
						${leftovers.qty} *
						case
							when ${dishes.servingUnit} = 'kg' then 1
							when ${dishes.avgServingWeightG} is not null and ${dishes.avgServingWeightG} > 0
								then ${dishes.avgServingWeightG} / 1000.0
							else 0
						end
					), 0)
				`,
				reusedKg: sql<string>`
					coalesce(sum(
						coalesce(${leftoverDispositions.retainQty}, 0) *
						case
							when ${dishes.servingUnit} = 'kg' then 1
							when ${dishes.avgServingWeightG} is not null and ${dishes.avgServingWeightG} > 0
								then ${dishes.avgServingWeightG} / 1000.0
							else 0
						end
					), 0)
				`,
				soldKg: sql<string>`
					coalesce(sum(
						coalesce(${leftoverDispositions.sellQty}, 0) *
						case
							when ${dishes.servingUnit} = 'kg' then 1
							when ${dishes.avgServingWeightG} is not null and ${dishes.avgServingWeightG} > 0
								then ${dishes.avgServingWeightG} / 1000.0
							else 0
						end
					), 0)
				`,
				donatedKg: sql<string>`
					coalesce(sum(
						coalesce(${leftoverDispositions.donateQty}, 0) *
						case
							when ${dishes.servingUnit} = 'kg' then 1
							when ${dishes.avgServingWeightG} is not null and ${dishes.avgServingWeightG} > 0
								then ${dishes.avgServingWeightG} / 1000.0
							else 0
						end
					), 0)
				`,
				binnedKg: sql<string>`
					coalesce(sum(
						coalesce(${leftoverDispositions.wasteQty}, 0) *
						case
							when ${dishes.servingUnit} = 'kg' then 1
							when ${dishes.avgServingWeightG} is not null and ${dishes.avgServingWeightG} > 0
								then ${dishes.avgServingWeightG} / 1000.0
							else 0
						end
					), 0)
				`,
			})
			.from(leftovers)
			.innerJoin(dishes, eq(dishes.id, leftovers.dishId))
			.leftJoin(leftoverDispositions, eq(leftoverDispositions.leftoverId, leftovers.id))
			.where(inRange(leftovers.serviceDate, range))
			.groupBy(grainBucket(grain, leftovers.preparedAt))
		return rows.map((row) => ({
			bucket: row.bucket,
			leftoverKg: toNumber(row.leftoverKg),
			reusedKg: toNumber(row.reusedKg),
			soldKg: toNumber(row.soldKg),
			donatedKg: toNumber(row.donatedKg),
			binnedKg: toNumber(row.binnedKg),
		}))
	})

export const loadOpenListingsCount = async (ctx: SessionContext): Promise<number> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({ open: sql<string>`count(*)` })
			.from(surplusListings)
			.where(and(eq(surplusListings.status, "open"), eq(surplusListings.tenantId, ctx.tenantId)))
		return toNumber(rows[0]?.open ?? "0")
	})

export const loadPendingLeftoversCount = async (
	ctx: SessionContext,
	range: DateRange,
): Promise<number> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({ pending: sql<string>`count(*)` })
			.from(leftovers)
			.where(
				and(eq(leftovers.status, "pending_disposition"), inRange(leftovers.serviceDate, range)),
			)
		return toNumber(rows[0]?.pending ?? "0")
	})

export const loadB2bProceeds = async (ctx: SessionContext, range: DateRange): Promise<number> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				proceeds: sql<string>`
					coalesce(sum(${listingItems.qty} * ${surplusListings.pricePerUnit}), 0)
				`,
			})
			.from(listingItems)
			.innerJoin(surplusListings, eq(surplusListings.id, listingItems.listingId))
			.innerJoin(leftovers, eq(leftovers.id, listingItems.leftoverId))
			.where(
				and(
					eq(surplusListings.channel, "b2b"),
					eq(surplusListings.status, "completed"),
					inRange(leftovers.serviceDate, range),
				),
			)
		return toNumber(rows[0]?.proceeds ?? "0")
	})

export const loadDashboardTotals = async (
	ctx: SessionContext,
	range: DateRange,
): Promise<DashboardTotals> => {
	const [prepared, outcomes, b2bProceeds, pendingLeftovers, openListings] = await Promise.all([
		withTenant(ctx, async (tx) => {
			const rows = await tx
				.select({
					servingUnit: dishes.servingUnit,
					avgServingWeightG: dishes.avgServingWeightG,
					costPerUnit: dishes.costPerUnit,
					prepared: sql<string>`coalesce(sum(${prepEntries.qtyPrepared}), 0)`,
				})
				.from(prepEntries)
				.innerJoin(dishes, eq(dishes.id, prepEntries.dishId))
				.where(inRange(prepEntries.serviceDate, range))
				.groupBy(dishes.id)
			return rows.map((row) => ({
				servingUnit: row.servingUnit,
				avgServingWeightG: toNumber(row.avgServingWeightG),
				costPerUnit: toNumber(row.costPerUnit),
				prepared: toNumber(row.prepared),
			}))
		}),
		withTenant(ctx, async (tx) => {
			const rows = await tx
				.select({
					servingUnit: dishes.servingUnit,
					avgServingWeightG: dishes.avgServingWeightG,
					costPerUnit: dishes.costPerUnit,
					leftover: sql<string>`coalesce(sum(${leftovers.qty}), 0)`,
					reused: sql<string>`coalesce(sum(${leftoverDispositions.retainQty}), 0)`,
					sold: sql<string>`coalesce(sum(${leftoverDispositions.sellQty}), 0)`,
					donated: sql<string>`coalesce(sum(${leftoverDispositions.donateQty}), 0)`,
					binned: sql<string>`coalesce(sum(${leftoverDispositions.wasteQty}), 0)`,
				})
				.from(leftovers)
				.innerJoin(dishes, eq(dishes.id, leftovers.dishId))
				.leftJoin(leftoverDispositions, eq(leftoverDispositions.leftoverId, leftovers.id))
				.where(inRange(leftovers.serviceDate, range))
				.groupBy(dishes.id)
			return rows.map((row) => ({
				servingUnit: row.servingUnit,
				avgServingWeightG: toNumber(row.avgServingWeightG),
				costPerUnit: toNumber(row.costPerUnit),
				leftover: toNumber(row.leftover),
				reused: toNumber(row.reused),
				sold: toNumber(row.sold),
				donated: toNumber(row.donated),
				binned: toNumber(row.binned),
			}))
		}),
		loadB2bProceeds(ctx, range),
		loadPendingLeftoversCount(ctx, range),
		loadOpenListingsCount(ctx),
	])
	return {
		prepared,
		outcomes,
		b2bProceeds,
		pendingLeftovers,
		openListings,
	}
}

export const loadWasteSeries = async (
	ctx: SessionContext,
	range: DateRange,
	grain: DateGrain,
): Promise<WasteBucket[]> => {
	const outcomes = await loadOutcomeSeries(ctx, range, grain)
	const filled = zeroFillBuckets(outcomes, range, grain)
	return filled.map((row) => {
		const leftover = row.leftoverKg
		const binned = row.binnedKg
		const surplus = Math.max(0, leftover - binned)
		return { bucket: row.bucket, surplusKg: roundKg(surplus), wasteKg: roundKg(binned) }
	})
}

export const loadRecoverySeries = async (
	ctx: SessionContext,
	range: DateRange,
	grain: DateGrain,
): Promise<RecoveryBucket[]> => {
	const outcomes = await loadOutcomeSeries(ctx, range, grain)
	const filled = zeroFillBuckets(outcomes, range, grain)
	return filled.map((row) => {
		const totalRecovered = row.reusedKg + row.soldKg + row.donatedKg
		const recoveryRate = row.leftoverKg > 0 ? roundRatio(totalRecovered / row.leftoverKg) : 0
		return {
			bucket: row.bucket,
			reusedKg: roundKg(row.reusedKg),
			soldKg: roundKg(row.soldKg),
			donatedKg: roundKg(row.donatedKg),
			totalRecoveredKg: roundKg(totalRecovered),
			recoveryRate,
		}
	})
}

export const loadDishRecovery = async (
	ctx: SessionContext,
	range: DateRange,
): Promise<DishRecovery[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.execute<{
			dish_id: string
			name: string
			serving_unit: typeof dishes.$inferSelect.servingUnit
			prepared: string
			leftover: string
			reused: string
			sold: string
			donated: string
			wasted: string
			avg_serving_weight_g: string | null
		}>(sql`
			with dish_prep as (
				select dish_id, sum(qty_prepared) as prepared
				from prep_entries
				where service_date between ${range.from} and ${range.to}
				group by dish_id
			),
			dish_outcomes as (
				select
					l.dish_id,
					coalesce(sum(l.qty), 0) as leftover,
					coalesce(sum(d.retain_qty), 0) as reused,
					coalesce(sum(d.sell_qty), 0) as sold,
					coalesce(sum(d.donate_qty), 0) as donated,
					coalesce(sum(d.waste_qty), 0) as wasted
				from leftovers l
				left join leftover_dispositions d on d.leftover_id = l.id
				where l.service_date between ${range.from} and ${range.to}
				group by l.dish_id
			)
			select
				di.id as dish_id,
				di.name,
				di.serving_unit,
				coalesce(p.prepared, 0) as prepared,
				coalesce(o.leftover, 0) as leftover,
				coalesce(o.reused, 0) as reused,
				coalesce(o.sold, 0) as sold,
				coalesce(o.donated, 0) as donated,
				coalesce(o.wasted, 0) as wasted,
				di.avg_serving_weight_g
			from dishes di
			left join dish_prep p on p.dish_id = di.id
			left join dish_outcomes o on o.dish_id = di.id
			where di.archived_at is null
		`)

		return rows.map((row) => {
			const weight =
				row.serving_unit === "kg" || !row.avg_serving_weight_g
					? row.serving_unit === "kg"
						? 1
						: 0
					: Number(row.avg_serving_weight_g) / 1000
			const factor = weight > 0 ? weight : 0
			const prepared = toNumber(row.prepared)
			const leftover = toNumber(row.leftover)
			const reused = toNumber(row.reused)
			const sold = toNumber(row.sold)
			const donated = toNumber(row.donated)
			const wasted = toNumber(row.wasted)
			const recovered = reused + sold + donated
			return {
				dishId: row.dish_id,
				name: row.name,
				servingUnit: row.serving_unit,
				prepared,
				leftover,
				reused,
				sold,
				donated,
				wasted,
				preparedKg: roundKg(prepared * factor),
				leftoverKg: roundKg(leftover * factor),
				reusedKg: roundKg(reused * factor),
				soldKg: roundKg(sold * factor),
				donatedKg: roundKg(donated * factor),
				wastedKg: roundKg(wasted * factor),
				recoveryRate: leftover > 0 ? roundRatio(recovered / leftover) : 0,
			}
		})
	})

export const loadForecasts = async (ctx: SessionContext, range: DateRange): Promise<Forecast[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				restaurantId: predictions.restaurantId,
				targetRef: predictions.targetRef,
				payload: predictions.payload,
				source: predictions.source,
			})
			.from(predictions)
			.where(and(eq(predictions.kind, "prep_forecast")))

		const out: Forecast[] = []
		for (const row of rows) {
			const payload = row.payload as {
				dishId?: string
				dishName?: string
				predictedQty?: number
				confidence?: number
				targetDate?: string
			}
			if (!payload.dishId) continue
			if (
				payload.targetDate &&
				(payload.targetDate < range.from || payload.targetDate > range.to)
			) {
				continue
			}
			out.push({
				dishId: payload.dishId,
				dishName: payload.dishName ?? "",
				predictedQty: Number(payload.predictedQty ?? 0),
				confidence: Number(payload.confidence ?? 0),
				source: row.source,
			})
		}
		return out
	})

const roundKg = (value: number): number => Math.round(value * 1000) / 1000

const roundRatio = (value: number): number => Math.round(value * 10000) / 10000
