import { z } from "zod"

export const marketListingSchema = z.object({
	id: z.string(),
	tenantId: z.string(),
	channel: z.enum(["b2b", "ngo"]),
	pricePerUnit: z.string(),
	qty: z.string(),
	unit: z.enum(["kg", "plate", "piece", "litre"]),
	pickupFrom: z.string(),
	pickupUntil: z.string(),
	safeUntil: z.string(),
	claimedByTenantId: z.string().nullable(),
	restaurantName: z.string(),
	restaurantCity: z.string(),
})

export const marketListResponseSchema = z.array(marketListingSchema)
