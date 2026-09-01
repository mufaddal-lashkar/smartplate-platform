import type { Ingredient } from "../../db/schema"
import type { SessionContext } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import {
	findIngredientById,
	insertIngredient,
	selectActiveIngredients,
	updateIngredient,
} from "./ingredients.queries"
import type { IngredientInput } from "./ingredients.schema"

const ingredientNotFound = () =>
	new ApiError("RESOURCE_NOT_FOUND", "That ingredient is no longer in your catalogue.")

export const listIngredients = async (ctx: SessionContext): Promise<Ingredient[]> =>
	selectActiveIngredients(ctx)

export const createIngredient = async (
	ctx: SessionContext,
	input: IngredientInput,
): Promise<Ingredient> => insertIngredient(ctx, input)

export const updateIngredientById = async (
	ctx: SessionContext,
	id: string,
	input: IngredientInput,
): Promise<Ingredient> => {
	const updated = await updateIngredient(ctx, id, input)
	if (updated == null) throw ingredientNotFound()
	return updated
}

export const getIngredient = async (ctx: SessionContext, id: string): Promise<Ingredient> => {
	const found = await findIngredientById(ctx, id)
	if (found == null) throw ingredientNotFound()
	return found
}
