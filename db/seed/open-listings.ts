import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../../apps/main-service/src/db/tx"
import type { Clock } from "../../apps/main-service/src/shared/clock"

const OPEN_LISTINGS: {
	channel: "b2b" | "ngo"
	unit: "plate" | "piece" | "kg" | "litre"
	qty: number
	pricePerUnit: number
	safeUntilMinutes: number
}[] = [
	{ channel: "b2b", unit: "plate", qty: 12, pricePerUnit: 90, safeUntilMinutes: 180 },
	{ channel: "b2b", unit: "plate", qty: 8, pricePerUnit: 70, safeUntilMinutes: 240 },
	{ channel: "ngo", unit: "piece", qty: 40, pricePerUnit: 0, safeUntilMinutes: 360 },
	{ channel: "b2b", unit: "plate", qty: 15, pricePerUnit: 60, safeUntilMinutes: 240 },
	{ channel: "ngo", unit: "plate", qty: 10, pricePerUnit: 0, safeUntilMinutes: 360 },
	{ channel: "b2b", unit: "plate", qty: 18, pricePerUnit: 80, safeUntilMinutes: 240 },
	{ channel: "ngo", unit: "kg", qty: 5, pricePerUnit: 0, safeUntilMinutes: 480 },
]

export const seedOpenListings = async (clock: Clock): Promise<number> => {
	const now = clock.now()
	let inserted = 0

	const result = await withSuperAdmin(async (tx) => {
		const sellerRows = await tx.execute(sql`
			select t.id as tenant_id, r.id as restaurant_id, r.latitude, r.longitude
			  from tenants t
			  join restaurants r on r.tenant_id = t.id
			 where t.name = 'Spice Route'
			 order by t.created_at desc
			 limit 1
		`)
		const seller = sellerRows[0] as
			| { tenant_id: string; restaurant_id: string; latitude: string; longitude: string }
			| undefined
		if (seller == null) return 0

		for (const spec of OPEN_LISTINGS) {
			const pickupFrom = now.add(15, "minute").toISOString()
			const pickupUntil = now.add(120, "minute").toISOString()
			const safeUntil = now.add(spec.safeUntilMinutes, "minute").toISOString()

			const listingId = crypto.randomUUID()
			await tx.execute(sql`
				insert into surplus_listings
					(id, tenant_id, restaurant_id, channel, status, qty, unit, price_per_unit,
					 pickup_from, pickup_until, safe_until, escalate_at, created_at, latitude, longitude)
				values
					(${listingId}, ${seller.tenant_id}, ${seller.restaurant_id},
					 ${spec.channel}::listing_channel, 'open'::listing_status,
					 ${spec.qty}, ${spec.unit}::serving_unit, ${spec.pricePerUnit},
					 ${pickupFrom}, ${pickupUntil}, ${safeUntil}, null,
					 ${now.toISOString()}, ${seller.latitude}, ${seller.longitude})
			`)
			await tx.execute(sql`
				insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
				values (${seller.tenant_id}, ${listingId}, 'listed',
				        ${`${spec.qty} ${spec.unit} at ₹${spec.pricePerUnit} per ${spec.unit}`},
				        ${now.toISOString()})
			`)
			inserted += 1
		}
		return inserted
	})

	return result
}
