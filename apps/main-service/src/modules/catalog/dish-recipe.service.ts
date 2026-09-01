import type { SessionContext } from "../../db/tx"
import { listRecipeForDish, type RecipeLine, replaceRecipe } from "./dish-recipe.queries"
import type { RecipeInput } from "./dish-recipe.schema"

export const getRecipe = async (ctx: SessionContext, dishId: string): Promise<RecipeLine[]> =>
	listRecipeForDish(ctx, dishId)

export const setRecipe = async (
	ctx: SessionContext,
	dishId: string,
	input: RecipeInput,
): Promise<RecipeLine[]> => replaceRecipe(ctx, dishId, input.items)
