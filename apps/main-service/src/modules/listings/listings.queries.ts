import type { Dayjs } from "dayjs"
import { asc, desc, inArray, sql } from "drizzle-orm"
import { listingEvents, listingItems, type SurplusListing, surplusListings } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"

export type ListingEventRow = {
	event: string
	detail: string
	occurredAt: string
}

export type ListingItemRow = {
	leftoverId: string
	qty: string
}

export type ListingWithEvents = SurplusListing & {
	events: ListingEventRow[]
	items: ListingItemRow[]
}

export type DueEscalation = {
	listingId: string
	tenantId: string
}

const ownerContext = (tenantId: string): SessionContext => ({
	tenantId,
	tenantType: "restaurant",
	role: "owner",
	userId: "",
})

const sweeperContext: SessionContext = {
	tenantId: "",
	tenantType: "restaurant",
	role: "super_admin",
	userId: "",
}

export const selectListings = async (ctx: SessionContext): Promise<ListingWithEvents[]> =>
	withTenant(ctx, async (tx) => {
		const listings = await tx
			.select()
			.from(surplusListings)
			.orderBy(desc(surplusListings.createdAt))
		if (listings.length === 0) return []

		const ids = listings.map((listing) => listing.id)

		const events = await tx
			.select({
				listingId: listingEvents.listingId,
				event: listingEvents.event,
				detail: listingEvents.detail,
				occurredAt: listingEvents.occurredAt,
			})
			.from(listingEvents)
			.where(inArray(listingEvents.listingId, ids))
			.orderBy(asc(listingEvents.occurredAt))

		const items = await tx
			.select({
				listingId: listingItems.listingId,
				leftoverId: listingItems.leftoverId,
				qty: listingItems.qty,
			})
			.from(listingItems)
			.where(inArray(listingItems.listingId, ids))

		return listings.map((listing) => ({
			...listing,
			events: events
				.filter((row) => row.listingId === listing.id)
				.map((row) => ({
					event: row.event,
					detail: row.detail,
					occurredAt: row.occurredAt.toISOString(),
				})),
			items: items
				.filter((row) => row.listingId === listing.id)
				.map((row) => ({ leftoverId: row.leftoverId, qty: row.qty })),
		}))
	})

export const escalateOpenB2b = async (
	listingId: string,
	tenantId: string,
	occurredAt: Dayjs,
): Promise<boolean> =>
	withTenant(ownerContext(tenantId), async (tx) => {
		const updated = await tx.execute(sql`
			update surplus_listings
			   set channel = 'ngo', price_per_unit = 0, escalate_at = null
			 where id = ${listingId} and status = 'open' and channel = 'b2b'
			returning id
		`)
		if (updated.length === 0) return false

		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (
				${tenantId}, ${listingId}, 'escalated',
				'The b2b window closed, so this is now offered to ngos.',
				${occurredAt.toISOString()}
			)
		`)
		return true
	})

export const selectDueEscalations = async (now: Dayjs, limit: number): Promise<DueEscalation[]> =>
	withTenant(sweeperContext, async (tx) => {
		const rows = await tx.execute(sql`
			select id, tenant_id
			  from surplus_listings
			 where status = 'open'
			   and channel = 'b2b'
			   and escalate_at is not null
			   and escalate_at <= ${now.toISOString()}
			 order by escalate_at asc
			 limit ${limit}
		`)
		return rows.map((row) => ({ listingId: String(row.id), tenantId: String(row.tenant_id) }))
	})
