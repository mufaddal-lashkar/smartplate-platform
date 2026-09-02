import { Elysia, t } from "elysia"
import { requirePermission, requireTenantType } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { updateRestaurantSchema } from "./restaurant.schema"
import { findRestaurant, updateRestaurant } from "./restaurant.service"

export const restaurantRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/restaurant", async ({ session }) => {
		const active = requireSession(session)
		requireTenantType(active, "restaurant")
		return findRestaurant(active)
	})
	.patch(
		"/v1/restaurant",
		async ({ body, session }) => {
			const active = requireSession(session)
			requireTenantType(active, "restaurant")
			await requirePermission(active, "settings.write")
			const input = updateRestaurantSchema.parse(body)
			return updateRestaurant(active, input)
		},
		{
			body: t.Object({
				name: t.Optional(t.String()),
				addressLine: t.Optional(t.String()),
				city: t.Optional(t.String()),
				state: t.Optional(t.String()),
				pinCode: t.Optional(t.String()),
				cuisineType: t.Optional(t.String()),
				gstNumber: t.Optional(t.String()),
				contactPhone: t.Optional(t.String()),
				logoUrl: t.Optional(t.String()),
				browseRadiusKm: t.Optional(t.String()),
				latitude: t.Optional(t.String()),
				longitude: t.Optional(t.String()),
			}),
		},
	)
