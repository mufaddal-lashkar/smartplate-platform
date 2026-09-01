import { and, eq } from "drizzle-orm"
import type { InventoryLot, InventoryMovement } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { addLot, adjustLot } from "../../shared/fefo"
import { resolveRestaurantId } from "../catalog/catalog.queries"
import {
	type ExpiringLot,
	findIngredientById,
	findLotForUpdate,
	notFound,
	type StockAggregate,
	selectExpiringLots,
	selectLotsForIngredient,
	selectMovements,
	selectStockAggregates,
} from "./inventory.queries"
import type { AdjustmentInput, PurchaseInput } from "./inventory.schema"

export const recordPurchase = async (
	ctx: SessionContext,
	input: PurchaseInput,
	occurredAt: Date,
): Promise<{ lot: InventoryLot }> =>
	withTenant(ctx, async (tx) => {
		const restaurantId = await resolveRestaurantId(tx, ctx)
		const ingredient = await findIngredientById(ctx, input.ingredientId)
		if (ingredient == null) throw notFound("That ingredient is not on file.")

		const { lotId } = await addLot(tx, {
			tenantId: ctx.tenantId,
			restaurantId,
			ingredientId: input.ingredientId,
			qtyPurchasedBase: input.qtyPurchasedBase,
			unitCost: input.unitCost,
			purchaseDate: input.purchaseDate,
			expiryDate: input.expiryDate,
			occurredAt,
			reason: "use",
		})

		const { inventoryLots } = await import("../../db/schema")
		const rows = await tx
			.select()
			.from(inventoryLots)
			.where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.tenantId, ctx.tenantId)))
			.limit(1)
		const lot = rows[0]
		if (lot == null) throw new ApiError("INTERNAL", "Purchase was recorded but the lot is missing.")
		return { lot }
	})

export const recordAdjustment = async (
	ctx: SessionContext,
	input: AdjustmentInput,
	occurredAt: Date,
): Promise<{ newRemaining: number }> =>
	withTenant(ctx, async (tx) => {
		const restaurantId = await resolveRestaurantId(tx, ctx)
		const lot = await findLotForUpdate(ctx, input.lotId)
		if (lot == null) throw notFound("That lot no longer exists.")

		return adjustLot(tx, {
			tenantId: ctx.tenantId,
			restaurantId,
			lotId: input.lotId,
			ingredientId: input.ingredientId,
			qtyDeltaBase: input.qtyDeltaBase,
			reason: input.reason,
			occurredAt,
		})
	})

export const getStock = async (ctx: SessionContext): Promise<StockAggregate[]> =>
	selectStockAggregates(ctx)

export const getLots = async (
	ctx: SessionContext,
	ingredientId: string,
): Promise<InventoryLot[]> => {
	if (ingredientId === "") return []
	return selectLotsForIngredient(ctx, ingredientId)
}

export const getExpiring = async (
	ctx: SessionContext,
	withinDays: number,
): Promise<ExpiringLot[]> => selectExpiringLots(ctx, withinDays)

export const getMovements = async (
	ctx: SessionContext,
	ingredientIds: string[],
): Promise<InventoryMovement[]> => selectMovements(ctx, ingredientIds)
