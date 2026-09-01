import { sql } from "drizzle-orm"
import { type SessionContext, withSuperAdmin, withTenant } from "../../db/tx"

export type MarketListingRow = {
	id: string
	tenantId: string
	channel: "b2b" | "ngo"
	pricePerUnit: string
	qty: string
	unit: "kg" | "plate" | "piece" | "litre"
	pickupFrom: string
	pickupUntil: string
	safeUntil: string
	claimedByTenantId: string | null
	restaurantName: string
	restaurantCity: string
}

const ownerContext = (tenantId: string): SessionContext => ({
	tenantId,
	tenantType: "restaurant",
	role: "owner",
	userId: "",
})

const _ngoContext = (tenantId: string): SessionContext => ({
	tenantId,
	tenantType: "ngo",
	role: "ngo_admin",
	userId: "",
})

export const selectMarketListings = async (ctx: SessionContext): Promise<MarketListingRow[]> =>
	withTenant(ctx, async (tx) => {
		const radiusColumn = ctx.tenantType === "ngo" ? "service_radius_km" : "browse_radius_km"
		const radiusTable = ctx.tenantType === "ngo" ? "ngos" : "restaurants"
		const rows = await tx.execute(sql`
			select
				sl.id, sl.tenant_id, sl.channel, sl.price_per_unit, sl.qty, sl.unit,
				sl.pickup_from, sl.pickup_until, sl.safe_until, sl.claimed_by_tenant_id,
				(select name from restaurants where id = sl.restaurant_id) as restaurant_name,
				(select city from restaurants where id = sl.restaurant_id) as restaurant_city
			  from surplus_listings sl
			 where sl.status = 'open'
			   and sl.geog is not null
			   and exists (
			     select 1 from ${sql.raw(radiusTable)} r
			     where r.tenant_id = ${ctx.tenantId}
			       and r.latitude is not null
			       and r.longitude is not null
			       and ST_DWithin(
			         sl.geog,
			         ST_SetSRID(ST_MakePoint(r.longitude::float8, r.latitude::float8), 4326)::geography,
			         r.${sql.raw(radiusColumn)} * 1000
			       )
			   )
			 order by sl.pickup_until asc
		`)
		return rows.map((row) => ({
			id: String(row.id),
			tenantId: String(row.tenant_id),
			channel: row.channel as "b2b" | "ngo",
			pricePerUnit: String(row.price_per_unit),
			qty: String(row.qty),
			unit: row.unit as MarketListingRow["unit"],
			pickupFrom: new Date(row.pickup_from as string).toISOString(),
			pickupUntil: new Date(row.pickup_until as string).toISOString(),
			safeUntil: new Date(row.safe_until as string).toISOString(),
			claimedByTenantId: row.claimed_by_tenant_id == null ? null : String(row.claimed_by_tenant_id),
			restaurantName: String(row.restaurant_name ?? ""),
			restaurantCity: String(row.restaurant_city ?? ""),
		}))
	})

export const selectOwnMarketListings = async (tenantId: string): Promise<MarketListingRow[]> =>
	withTenant(ownerContext(tenantId), async (tx) => {
		const rows = await tx.execute(sql`
			select
				sl.id, sl.tenant_id, sl.channel, sl.price_per_unit, sl.qty, sl.unit,
				sl.pickup_from, sl.pickup_until, sl.safe_until, sl.claimed_by_tenant_id,
				r.name as restaurant_name, r.city as restaurant_city
			  from surplus_listings sl
			  join restaurants r on r.id = sl.restaurant_id
			 where sl.tenant_id = ${tenantId}
			 order by sl.pickup_until asc
		`)
		return rows.map((row) => ({
			id: String(row.id),
			tenantId: String(row.tenant_id),
			channel: row.channel as "b2b" | "ngo",
			pricePerUnit: String(row.price_per_unit),
			qty: String(row.qty),
			unit: row.unit as MarketListingRow["unit"],
			pickupFrom: new Date(row.pickup_from as string).toISOString(),
			pickupUntil: new Date(row.pickup_until as string).toISOString(),
			safeUntil: new Date(row.safe_until as string).toISOString(),
			claimedByTenantId: row.claimed_by_tenant_id == null ? null : String(row.claimed_by_tenant_id),
			restaurantName: String(row.restaurant_name ?? ""),
			restaurantCity: String(row.restaurant_city ?? ""),
		}))
	})

export const selectNgoPickups = async (tenantId: string): Promise<MarketListingRow[]> =>
	withSuperAdmin(async (tx) => {
		const rows = await tx.execute(sql`
			select
				sl.id, sl.tenant_id, sl.channel, sl.price_per_unit, sl.qty, sl.unit,
				sl.pickup_from, sl.pickup_until, sl.safe_until, sl.claimed_by_tenant_id,
				(select name from restaurants where id = sl.restaurant_id) as restaurant_name,
				(select city from restaurants where id = sl.restaurant_id) as restaurant_city
			  from surplus_listings sl
			 where sl.claimed_by_tenant_id = ${tenantId}
			 order by sl.pickup_until asc
		`)
		return rows.map((row) => ({
			id: String(row.id),
			tenantId: String(row.tenant_id),
			channel: row.channel as "b2b" | "ngo",
			pricePerUnit: String(row.price_per_unit),
			qty: String(row.qty),
			unit: row.unit as MarketListingRow["unit"],
			pickupFrom: new Date(row.pickup_from as string).toISOString(),
			pickupUntil: new Date(row.pickup_until as string).toISOString(),
			safeUntil: new Date(row.safe_until as string).toISOString(),
			claimedByTenantId: String(row.claimed_by_tenant_id),
			restaurantName: String(row.restaurant_name ?? ""),
			restaurantCity: String(row.restaurant_city ?? ""),
		}))
	})

export const findNgoActiveWindow = async (
	tenantId: string,
): Promise<{ activeFrom: string; activeTo: string } | null> => {
	return withSuperAdmin(async (tx) => {
		const rows = await tx.execute(sql`
			select active_from, active_to from ngos where tenant_id = ${tenantId} limit 1
		`)
		const row = rows[0]
		if (row == null) return null
		return {
			activeFrom: String(row.active_from ?? "00:00"),
			activeTo: String(row.active_to ?? "23:59"),
		}
	})
}
