import { and, eq } from "drizzle-orm"
import { type Ingredient, ingredients } from "../../db/schema"
import { type SessionContext, type Tx, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { resolveRestaurantId } from "./catalog.queries"
import type { IngredientInput } from "./ingredients.schema"

const ingredientColumns = (input: IngredientInput) => ({
	name: input.name,
	category: input.category,
	baseUnit: input.baseUnit,
	pieceWeightG: input.pieceWeightG > 0 ? String(input.pieceWeightG) : null,
})

export const selectActiveIngredients = async (ctx: SessionContext): Promise<Ingredient[]> =>
	withTenant(ctx, (tx) => tx.select().from(ingredients).orderBy(ingredients.name))

export const insertIngredient = async (
	ctx: SessionContext,
	input: IngredientInput,
): Promise<Ingredient> =>
	withTenant(ctx, async (tx) => {
		const restaurantId = await resolveRestaurantId(tx, ctx)
		const rows = await tx
			.insert(ingredients)
			.values({
				tenantId: ctx.tenantId,
				restaurantId,
				...ingredientColumns(input),
			})
			.returning()
		const created = rows[0] ?? null
		if (created == null) throw new ApiError("INTERNAL", "The ingredient could not be saved.")
		return created
	})

export const updateIngredient = async (
	ctx: SessionContext,
	id: string,
	input: IngredientInput,
): Promise<Ingredient | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.update(ingredients)
			.set(ingredientColumns(input))
			.where(eq(ingredients.id, id))
			.returning()
		return rows[0] ?? null
	})

export const findIngredientById = async (
	ctx: SessionContext,
	id: string,
): Promise<Ingredient | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(ingredients)
			.where(and(eq(ingredients.id, id), eq(ingredients.tenantId, ctx.tenantId)))
			.limit(1)
		return rows[0] ?? null
	})

export const findIngredientForUpdate = async (tx: Tx, id: string): Promise<Ingredient | null> => {
	const rows = await tx.select().from(ingredients).where(eq(ingredients.id, id)).limit(1)
	return rows[0] ?? null
}
