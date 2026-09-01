import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, sql } from "drizzle-orm"
import {
	type Ingredient,
	type InventoryLot,
	type InventoryMovement,
	inventoryLots,
	inventoryMovements,
} from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"

export type StockAggregate = {
	ingredientId: string
	ingredientName: string
	baseUnit: string
	qtyOnHand: number
	lotCount: number
}

export const selectStockAggregates = async (ctx: SessionContext): Promise<StockAggregate[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				ingredientId: inventoryLots.ingredientId,
				ingredientName: sql<string>`(
					select name from ${sql.raw("ingredients")}
					where id = ${inventoryLots.ingredientId}
					limit 1
				)`,
				baseUnit: sql<string>`(
					select base_unit from ${sql.raw("ingredients")}
					where id = ${inventoryLots.ingredientId}
					limit 1
				)`,
				qtyOnHand: sql<string>`coalesce(sum(${inventoryLots.qtyRemainingBase}), 0)`,
				lotCount: sql<number>`count(*)::int`,
			})
			.from(inventoryLots)
			.groupBy(inventoryLots.ingredientId)

		return rows.map((r) => ({
			ingredientId: r.ingredientId,
			ingredientName: r.ingredientName,
			baseUnit: r.baseUnit,
			qtyOnHand: Number(r.qtyOnHand),
			lotCount: r.lotCount,
		}))
	})

export const selectLotsForIngredient = async (
	ctx: SessionContext,
	ingredientId: string,
): Promise<InventoryLot[]> =>
	withTenant(ctx, (tx) =>
		tx
			.select()
			.from(inventoryLots)
			.where(
				and(eq(inventoryLots.ingredientId, ingredientId), gt(inventoryLots.qtyRemainingBase, "0")),
			)
			.orderBy(asc(inventoryLots.expiryDate), asc(inventoryLots.purchaseDate)),
	)

export type ExpiringLot = {
	lot: InventoryLot
	ingredientName: string
	daysUntilExpiry: number
}

export const selectExpiringLots = async (
	ctx: SessionContext,
	withinDays: number,
): Promise<ExpiringLot[]> =>
	withTenant(ctx, async (tx) => {
		const today = new Date()
		const cutoff = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000)
		const todayStr = today.toISOString().slice(0, 10)
		const cutoffStr = cutoff.toISOString().slice(0, 10)

		const rows = await tx
			.select({
				lot: inventoryLots,
				ingredientName: sql<string>`(
					select name from ${sql.raw("ingredients")}
					where id = ${inventoryLots.ingredientId}
					limit 1
				)`,
			})
			.from(inventoryLots)
			.where(
				and(
					gt(inventoryLots.qtyRemainingBase, "0"),
					isNotNull(inventoryLots.expiryDate),
					gte(inventoryLots.expiryDate, todayStr),
					lte(inventoryLots.expiryDate, cutoffStr),
				),
			)
			.orderBy(asc(inventoryLots.expiryDate))

		return rows.map((r) => {
			const expiry = r.lot.expiryDate ? new Date(r.lot.expiryDate) : today
			const ms = expiry.getTime() - today.getTime()
			return {
				lot: r.lot,
				ingredientName: r.ingredientName,
				daysUntilExpiry: Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000))),
			}
		})
	})

export const selectMovements = async (
	ctx: SessionContext,
	ingredientIds: string[],
	limit = 200,
): Promise<InventoryMovement[]> =>
	withTenant(ctx, async (tx) => {
		const where =
			ingredientIds.length > 0
				? and(
						eq(inventoryMovements.tenantId, ctx.tenantId),
						inArray(inventoryMovements.ingredientId, ingredientIds),
					)
				: eq(inventoryMovements.tenantId, ctx.tenantId)
		return tx
			.select()
			.from(inventoryMovements)
			.where(where)
			.orderBy(desc(inventoryMovements.occurredAt))
			.limit(limit)
	})

export const findLotForUpdate = async (
	ctx: SessionContext,
	lotId: string,
): Promise<InventoryLot | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.select().from(inventoryLots).where(eq(inventoryLots.id, lotId)).limit(1)
		return rows[0] ?? null
	})

export const findIngredientById = async (
	ctx: SessionContext,
	ingredientId: string,
): Promise<Ingredient | null> =>
	withTenant(ctx, async (tx) => {
		const { ingredients } = await import("../../db/schema")
		const rows = await tx
			.select()
			.from(ingredients)
			.where(eq(ingredients.id, ingredientId))
			.limit(1)
		return rows[0] ?? null
	})

export const sumStockForIngredient = async (
	ctx: SessionContext,
	ingredientId: string,
): Promise<number> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				total: sql<string>`coalesce(sum(${inventoryLots.qtyRemainingBase}), 0)`,
			})
			.from(inventoryLots)
			.where(eq(inventoryLots.ingredientId, ingredientId))
		return Number(rows[0]?.total ?? 0)
	})

export const notFound = (msg: string) => new ApiError("RESOURCE_NOT_FOUND", msg)
