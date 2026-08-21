import { z } from "zod"
import { servingUnit } from "../../db/schema"

export const dishInputSchema = z.object({
	name: z.string().min(2).max(120),
	category: z.string().max(60).default(""),
	servingUnit: z.enum(servingUnit.enumValues),
	avgServingWeightG: z.number().min(0).max(100000),
	sellingPrice: z.number().min(0).max(1000000),
	costPerUnit: z.number().min(0).max(1000000),
	shelfLifeHours: z.number().int().min(1).max(720),
	isReusable: z.boolean(),
	reuseRoute: z.string().max(120).default(""),
})

export type DishInput = z.infer<typeof dishInputSchema>
