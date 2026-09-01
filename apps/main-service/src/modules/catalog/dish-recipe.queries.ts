import { eq, getTableColumns, inArray } from "drizzle-orm"
import { dishes, dishIngredients, type Ingredient, ingredients } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"

export type RecipeLine = {
	id: string
	ingredientId: string
	ingredientName: string
	qtyPerServing: number
	unit: string
}

export const listRecipeForDish = async (
	ctx: SessionContext,
	dishId: string,
): Promise<RecipeLine[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({
				...getTableColumns(dishIngredients),
				ingredientName: ingredients.name,
			})
			.from(dishIngredients)
			.innerJoin(ingredients, eq(ingredients.id, dishIngredients.ingredientId))
			.where(eq(dishIngredients.dishId, dishId))
		return rows.map((r) => ({
			id: r.id,
			ingredientId: r.ingredientId,
			ingredientName: r.ingredientName,
			qtyPerServing: Number(r.qtyPerServing),
			unit: r.unit,
		}))
	})

export const replaceRecipe = async (
	ctx: SessionContext,
	dishId: string,
	items: { ingredientId: string; qtyPerServing: number; unit: string }[],
): Promise<RecipeLine[]> =>
	withTenant(ctx, async (tx) => {
		const dishRows = await tx
			.select({ id: dishes.id })
			.from(dishes)
			.where(eq(dishes.id, dishId))
			.limit(1)
		if (dishRows[0] == null) {
			throw new ApiError("RESOURCE_NOT_FOUND", "That dish no longer exists.")
		}

		const ids = items.map((i) => i.ingredientId)
		const ingRows: Ingredient[] =
			ids.length > 0 ? await tx.select().from(ingredients).where(inArray(ingredients.id, ids)) : []
		const byId = new Map(ingRows.map((i) => [i.id, i]))

		for (const item of items) {
			const ing = byId.get(item.ingredientId)
			if (ing == null) {
				throw new ApiError(
					"RESOURCE_NOT_FOUND",
					`Ingredient ${item.ingredientId} is not in your catalogue.`,
				)
			}
			if (item.unit !== ing.baseUnit) {
				throw new ApiError(
					"VALIDATION_FAILED",
					`Recipe unit "${item.unit}" does not match the ingredient's base unit "${ing.baseUnit}".`,
					[
						{
							field: "items",
							code: "UNIT_MISMATCH",
							message: `Ingredient ${ing.name} is measured in ${ing.baseUnit}.`,
						},
					],
				)
			}
		}

		await tx.delete(dishIngredients).where(eq(dishIngredients.dishId, dishId))

		if (items.length > 0) {
			await tx.insert(dishIngredients).values(
				items.map((item) => ({
					tenantId: ctx.tenantId,
					dishId,
					ingredientId: item.ingredientId,
					qtyPerServing: String(item.qtyPerServing),
					unit: item.unit,
				})),
			)
		}

		return listRecipeForDish(ctx, dishId)
	})
