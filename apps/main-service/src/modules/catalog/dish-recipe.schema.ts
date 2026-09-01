import { z } from "zod"

export const recipeItemSchema = z.object({
	ingredientId: z.string().uuid(),
	qtyPerServing: z.number().positive().max(1_000_000),
	unit: z.string().min(1).max(40),
})

export const recipeInputSchema = z.object({
	items: z.array(recipeItemSchema).min(1).max(200),
})

export type RecipeItem = z.infer<typeof recipeItemSchema>
export type RecipeInput = z.infer<typeof recipeInputSchema>
