import { z } from "zod"

const numericString = z.string().regex(/^-?\d+(\.\d+)?$/, "must be a numeric string")

export const updateRestaurantSchema = z.object({
	name: z.string().min(2).max(120).optional(),
	addressLine: z.string().max(240).optional(),
	city: z.string().max(120).optional(),
	state: z.string().max(120).optional(),
	pinCode: z.string().max(20).optional(),
	cuisineType: z.string().max(120).optional(),
	gstNumber: z.string().max(40).optional(),
	contactPhone: z.string().max(40).optional(),
	logoUrl: z.string().max(500).optional(),
	browseRadiusKm: numericString.optional(),
	latitude: numericString.optional(),
	longitude: numericString.optional(),
})

export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>
