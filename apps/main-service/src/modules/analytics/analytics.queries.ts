import { and, eq, gte, lte, sql } from "drizzle-orm"
import {
	dishes,
	leftoverDispositions,
	leftovers,
	listingItems,
	prepEntries,
	type ServingUnit,
	surplusListings,
} from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"

export type DateRange = {
	from: string
	to: string
}

export type DishUnit = {
	servingUnit: ServingUnit
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

const toNumber = (value: string | null): number => (value == null ? 0 : Number(value))

export const loadDashboardTotals = async (
	ctx: SessionContext,
	range: DateRange,
): Promise<DashboardTotals> =>
	withTenant(ctx, async (tx) => {
		const inRange = (column: typeof prepEntries.serviceDate | typeof leftovers.serviceDate) =>
			and(gte(column, range.from), lte(column, range.to))

		const preparedRows = await tx
			.select({
				servingUnit: dishes.servingUnit,
				avgServingWeightG: dishes.avgServingWeightG,
				costPerUnit: dishes.costPerUnit,
				prepared: sql<string>`coalesce(sum(${prepEntries.qtyPrepared}), 0)`,
			})
			.from(prepEntries)
			.innerJoin(dishes, eq(dishes.id, prepEntries.dishId))
			.where(inRange(prepEntries.serviceDate))
			.groupBy(dishes.id)

		const outcomeRows = await tx
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
			.where(inRange(leftovers.serviceDate))
			.groupBy(dishes.id)

		const proceedsRows = await tx
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
					inRange(leftovers.serviceDate),
				),
			)

		const pendingRows = await tx
			.select({ pending: sql<string>`count(*)` })
			.from(leftovers)
			.where(and(eq(leftovers.status, "pending_disposition"), inRange(leftovers.serviceDate)))

		const openRows = await tx
			.select({ open: sql<string>`count(*)` })
			.from(surplusListings)
			.where(eq(surplusListings.status, "open"))

		return {
			prepared: preparedRows.map((row) => ({
				servingUnit: row.servingUnit,
				avgServingWeightG: toNumber(row.avgServingWeightG),
				costPerUnit: toNumber(row.costPerUnit),
				prepared: toNumber(row.prepared),
			})),
			outcomes: outcomeRows.map((row) => ({
				servingUnit: row.servingUnit,
				avgServingWeightG: toNumber(row.avgServingWeightG),
				costPerUnit: toNumber(row.costPerUnit),
				leftover: toNumber(row.leftover),
				reused: toNumber(row.reused),
				sold: toNumber(row.sold),
				donated: toNumber(row.donated),
				binned: toNumber(row.binned),
			})),
			b2bProceeds: toNumber(proceedsRows[0]?.proceeds ?? "0"),
			pendingLeftovers: toNumber(pendingRows[0]?.pending ?? "0"),
			openListings: toNumber(openRows[0]?.open ?? "0"),
		}
	})
