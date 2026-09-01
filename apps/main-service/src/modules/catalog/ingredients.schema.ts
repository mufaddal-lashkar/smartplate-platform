import { z } from "zod"

export const INGREDIENT_BASE_UNITS = ["g", "kg", "ml", "l", "piece", "each"] as const
export type IngredientBaseUnit = (typeof INGREDIENT_BASE_UNITS)[number]

export const ingredientInputSchema = z
	.object({
		name: z.string().min(1).max(120),
		category: z.string().min(1).max(60),
		baseUnit: z.enum(INGREDIENT_BASE_UNITS),
		pieceWeightG: z.number().min(0).max(100000).default(0),
	})
	.superRefine((value, ctx) => {
		if (value.baseUnit === "piece" && value.pieceWeightG <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["pieceWeightG"],
				message: "A piece-based ingredient must declare a positive piece weight in grams.",
			})
		}
	})

export type IngredientInput = z.infer<typeof ingredientInputSchema>
