import { sql } from "drizzle-orm"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { writeAuditLog } from "../../shared/audit"
import { findRestaurantInCtx, type RestaurantRow } from "./restaurant.queries"
import type { UpdateRestaurantInput } from "./restaurant.schema"

const toRestaurantRow = (row: Record<string, unknown>): RestaurantRow => ({
	id: String(row.id),
	tenantId: String(row.tenant_id),
	name: String(row.name),
	addressLine: String(row.address_line ?? ""),
	city: String(row.city ?? ""),
	state: String(row.state ?? ""),
	pinCode: String(row.pin_code ?? ""),
	cuisineType: String(row.cuisine_type ?? ""),
	gstNumber: String(row.gst_number ?? ""),
	contactPhone: String(row.contact_phone ?? ""),
	logoUrl: String(row.logo_url ?? ""),
	browseRadiusKm: String(row.browse_radius_km),
	latitude: row.latitude == null ? null : String(row.latitude),
	longitude: row.longitude == null ? null : String(row.longitude),
	createdAt: new Date(String(row.created_at)),
})

export const updateRestaurant = async (
	ctx: SessionContext,
	input: UpdateRestaurantInput,
): Promise<RestaurantRow> => {
	if (ctx.tenantType !== "restaurant") {
		throw new ApiError("TENANT_TYPE_MISMATCH", "This action is not available for your account.")
	}

	const before = await findRestaurantInCtx(ctx)
	if (before == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Restaurant not found.")
	}

	const result = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			update restaurants
			set
				name = coalesce(${input.name ?? null}, name),
				address_line = coalesce(${input.addressLine ?? null}, address_line),
				city = coalesce(${input.city ?? null}, city),
				state = coalesce(${input.state ?? null}, state),
				pin_code = coalesce(${input.pinCode ?? null}, pin_code),
				cuisine_type = coalesce(${input.cuisineType ?? null}, cuisine_type),
				gst_number = coalesce(${input.gstNumber ?? null}, gst_number),
				contact_phone = coalesce(${input.contactPhone ?? null}, contact_phone),
				logo_url = coalesce(${input.logoUrl ?? null}, logo_url),
				browse_radius_km = coalesce(${input.browseRadiusKm ?? null}, browse_radius_km),
				latitude = coalesce(${input.latitude ?? null}, latitude),
				longitude = coalesce(${input.longitude ?? null}, longitude)
			where tenant_id = ${ctx.tenantId}
			returning id, tenant_id, name, address_line, city, state, pin_code, cuisine_type,
			          gst_number, contact_phone, logo_url, browse_radius_km, latitude, longitude,
			          created_at
		`)
		return rows[0] ? toRestaurantRow(rows[0] as Record<string, unknown>) : null
	})

	if (result == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Restaurant not found.")
	}

	const changes: Record<string, string> = {}
	for (const [key, value] of Object.entries(input)) {
		if (value !== undefined) changes[key] = String(value)
	}

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: "restaurant.update",
			entityType: "restaurant",
			entityId: result.id,
			payload: changes,
		},
	)

	return result
}

export const findRestaurant = async (ctx: SessionContext): Promise<RestaurantRow> => {
	if (ctx.tenantType !== "restaurant") {
		throw new ApiError("TENANT_TYPE_MISMATCH", "This action is not available for your account.")
	}
	const restaurant = await findRestaurantInCtx(ctx)
	if (restaurant == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Restaurant not found.")
	}
	return restaurant
}
