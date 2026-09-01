import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm"
import {
	type Dish,
	dishes,
	dishIngredients,
	type Ingredient,
	ingredients,
	leftoverDispositions,
	leftovers,
	type NewPrepEntry,
	type PrepEntry,
	prepEntries,
	type ReuseConfirmation,
	reuseConfirmations,
} from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"

export type PrepEntryWithDish = PrepEntry & {
	dishName: string
	dishUnit: string
	dishAvgServingWeightG: string | null
}

const withDish = {
	...getTableColumns(prepEntries),
	dishName: dishes.name,
	dishUnit: dishes.servingUnit,
	dishAvgServingWeightG: dishes.avgServingWeightG,
}

export const insertPrepEntry = async (
	ctx: SessionContext,
	restaurantId: string,
	values: NewPrepEntry,
): Promise<PrepEntry> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.insert(prepEntries)
			.values({ ...values, tenantId: ctx.tenantId, restaurantId })
			.returning()
		const created = rows[0] ?? null
		if (created == null) throw new ApiError("INTERNAL", "The prep entry could not be saved.")
		return created
	})

export const findPrepEntryById = async (
	ctx: SessionContext,
	id: string,
): Promise<PrepEntryWithDish | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select(withDish)
			.from(prepEntries)
			.innerJoin(dishes, eq(dishes.id, prepEntries.dishId))
			.where(eq(prepEntries.id, id))
			.limit(1)
		return rows[0] ?? null
	})

export const listPrepEntries = async (
	ctx: SessionContext,
	serviceDate: string,
): Promise<PrepEntryWithDish[]> =>
	withTenant(ctx, async (tx) => {
		const where = serviceDate === "" ? sql`true` : eq(prepEntries.serviceDate, serviceDate)
		return tx
			.select(withDish)
			.from(prepEntries)
			.innerJoin(dishes, eq(dishes.id, prepEntries.dishId))
			.where(where)
			.orderBy(desc(prepEntries.preparedAt))
	})

export const updatePrepEntryServed = async (
	ctx: SessionContext,
	id: string,
	qtyServed: number,
	covers: number,
): Promise<PrepEntry | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.update(prepEntries)
			.set({ qtyServed: String(qtyServed), covers })
			.where(eq(prepEntries.id, id))
			.returning()
		return rows[0] ?? null
	})

export const findRecipeForDish = async (
	ctx: SessionContext,
	dishId: string,
): Promise<
	Array<{ ingredientId: string; qtyPerServing: number; unit: string; baseUnit: string }>
> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				ingredientId: dishIngredients.ingredientId,
				qtyPerServing: dishIngredients.qtyPerServing,
				unit: dishIngredients.unit,
				baseUnit: ingredients.baseUnit,
			})
			.from(dishIngredients)
			.innerJoin(ingredients, eq(ingredients.id, dishIngredients.ingredientId))
			.where(eq(dishIngredients.dishId, dishId))
		return rows.map((r) => ({
			ingredientId: r.ingredientId,
			qtyPerServing: Number(r.qtyPerServing),
			unit: r.unit,
			baseUnit: r.baseUnit,
		}))
	})

export const findDishById = async (ctx: SessionContext, dishId: string): Promise<Dish | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.select().from(dishes).where(eq(dishes.id, dishId)).limit(1)
		return rows[0] ?? null
	})

export const findIngredientById = async (
	ctx: SessionContext,
	ingredientId: string,
): Promise<Ingredient | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(ingredients)
			.where(eq(ingredients.id, ingredientId))
			.limit(1)
		return rows[0] ?? null
	})

export type ReusePending = {
	leftoverId: string
	leftoverQty: number
	unit: string
	retainQty: number
	dishName: string
	dishId: string
	safeUntil: string
	preparedAt: string
}

export const findReusePending = async (ctx: SessionContext): Promise<ReusePending[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				leftoverId: leftovers.id,
				leftoverQty: leftovers.qty,
				unit: leftovers.unit,
				retainQty: leftoverDispositions.retainQty,
				dishName: dishes.name,
				dishId: dishes.id,
				safeUntil: leftovers.safeUntil,
				preparedAt: leftovers.preparedAt,
			})
			.from(leftoverDispositions)
			.innerJoin(leftovers, eq(leftovers.id, leftoverDispositions.leftoverId))
			.innerJoin(dishes, eq(dishes.id, leftovers.dishId))
			.where(
				and(eq(leftovers.status, "awaiting_reuse"), sql`${leftoverDispositions.retainQty} > 0`),
			)
			.orderBy(desc(leftovers.preparedAt))
		return rows.map((r) => ({
			leftoverId: r.leftoverId,
			leftoverQty: Number(r.leftoverQty),
			unit: r.unit,
			retainQty: Number(r.retainQty),
			dishName: r.dishName,
			dishId: r.dishId,
			safeUntil: r.safeUntil.toISOString(),
			preparedAt: r.preparedAt.toISOString(),
		}))
	})

export const findLeftoverForReuse = async (
	ctx: SessionContext,
	leftoverId: string,
): Promise<{
	id: string
	dishId: string
	restaurantId: string
	tenantId: string
	status: string
	retainQty: number
	leftoverQty: number
	unit: string
} | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				id: leftovers.id,
				dishId: leftovers.dishId,
				restaurantId: leftovers.restaurantId,
				tenantId: leftovers.tenantId,
				status: leftovers.status,
				retainQty: leftoverDispositions.retainQty,
				leftoverQty: leftovers.qty,
				unit: leftovers.unit,
			})
			.from(leftovers)
			.innerJoin(leftoverDispositions, eq(leftoverDispositions.leftoverId, leftovers.id))
			.where(eq(leftovers.id, leftoverId))
			.limit(1)
		const row = rows[0]
		if (row == null) return null
		return {
			id: row.id,
			dishId: row.dishId,
			restaurantId: row.restaurantId,
			tenantId: row.tenantId,
			status: row.status,
			retainQty: Number(row.retainQty),
			leftoverQty: Number(row.leftoverQty),
			unit: row.unit,
		}
	})

export const insertReuseConfirmation = async (
	ctx: SessionContext,
	leftoverId: string,
	confirmedReusedQty: number,
	notes: string,
	confirmedAt: Date,
): Promise<ReuseConfirmation> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.insert(reuseConfirmations)
			.values({
				tenantId: ctx.tenantId,
				leftoverId,
				confirmedReusedQty: String(confirmedReusedQty),
				confirmedByUserId: ctx.userId,
				notes,
				confirmedAt,
			})
			.returning()
		const created = rows[0] ?? null
		if (created == null) throw new ApiError("INTERNAL", "Could not save reuse confirmation.")
		return created
	})

export const findReuseHistory = async (
	ctx: SessionContext,
	leftoverId: string,
): Promise<ReuseConfirmation[]> =>
	withTenant(ctx, async (tx) =>
		tx
			.select()
			.from(reuseConfirmations)
			.where(
				and(
					eq(reuseConfirmations.leftoverId, leftoverId),
					eq(reuseConfirmations.tenantId, ctx.tenantId),
				),
			)
			.orderBy(desc(reuseConfirmations.confirmedAt)),
	)

export const findReuseHistoryForDish = async (
	ctx: SessionContext,
	dishId: string,
): Promise<{ leftoverId: string; confirmedReusedQty: number; confirmedAt: string }[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				leftoverId: reuseConfirmations.leftoverId,
				confirmedReusedQty: reuseConfirmations.confirmedReusedQty,
				confirmedAt: reuseConfirmations.confirmedAt,
				dishId: leftovers.dishId,
			})
			.from(reuseConfirmations)
			.innerJoin(leftovers, eq(leftovers.id, reuseConfirmations.leftoverId))
			.where(
				and(eq(leftovers.dishId, dishId), inArray(reuseConfirmations.tenantId, [ctx.tenantId])),
			)
			.orderBy(desc(reuseConfirmations.confirmedAt))
		return rows.map((r) => ({
			leftoverId: r.leftoverId,
			confirmedReusedQty: Number(r.confirmedReusedQty),
			confirmedAt: r.confirmedAt.toISOString(),
		}))
	})
