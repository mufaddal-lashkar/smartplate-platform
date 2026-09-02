import { eq } from "drizzle-orm"
import { restaurants } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"

export type RestaurantRow = {
	id: string
	tenantId: string
	name: string
	addressLine: string
	city: string
	state: string
	pinCode: string
	cuisineType: string
	gstNumber: string
	contactPhone: string
	logoUrl: string
	browseRadiusKm: string
	latitude: string | null
	longitude: string | null
	createdAt: Date
}

export const findRestaurantInCtx = async (ctx: SessionContext): Promise<RestaurantRow | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(restaurants)
			.where(eq(restaurants.tenantId, ctx.tenantId))
			.limit(1)
		return (rows[0] as RestaurantRow | undefined) ?? null
	})
