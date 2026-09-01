import type { Dayjs } from "dayjs"
import { asc, desc, eq, inArray, sql } from "drizzle-orm"
import { listingEvents, listingItems, type SurplusListing, surplusListings } from "../../db/schema"
import { type SessionContext, withSuperAdmin, withTenant } from "../../db/tx"

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
	withSuperAdmin(async (tx) => {
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

export const selectListingForClaim = async (listingId: string): Promise<SurplusListing | null> =>
	withSuperAdmin(async (tx) => {
		const rows = await tx
			.select()
			.from(surplusListings)
			.where(eq(surplusListings.id, listingId))
			.for("update", { of: surplusListings, noWait: false })
			.limit(1)
		return rows[0] ?? null
	})

export const claimListing = async (
	listingId: string,
	listingOwnerTenantId: string,
	claimedByTenantId: string,
	now: Dayjs,
): Promise<boolean> =>
	withSuperAdmin(async (tx) => {
		const result = await tx.execute(sql`
			update surplus_listings
			   set claimed_by_tenant_id = ${claimedByTenantId},
			       claimed_at = ${now.toISOString()},
			       status = 'claimed'
			 where id = ${listingId} and status = 'open' and claimed_by_tenant_id is null
			returning id
		`)
		if (result.length === 0) return false

		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (
				${listingOwnerTenantId}, ${listingId}, 'claimed',
				${`Claimed by ${claimedByTenantId}.`},
				${now.toISOString()}
			)
		`)
		return true
	})

export const releaseListing = async (
	listingId: string,
	listingOwnerTenantId: string,
	claimedByTenantId: string,
	now: Dayjs,
): Promise<boolean> =>
	withSuperAdmin(async (tx) => {
		const result = await tx.execute(sql`
			update surplus_listings
			   set claimed_by_tenant_id = null,
			       claimed_at = null,
			       status = 'open'
			 where id = ${listingId}
			   and status = 'claimed'
			   and claimed_by_tenant_id = ${claimedByTenantId}
			returning id
		`)
		if (result.length === 0) return false

		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (
				${listingOwnerTenantId}, ${listingId}, 'released',
				${`Released by ${claimedByTenantId}.`},
				${now.toISOString()}
			)
		`)
		return true
	})

export const updateListingPrice = async (
	ctx: SessionContext,
	listingId: string,
	pricePerUnit: string,
	now: Dayjs,
): Promise<boolean> =>
	withTenant(ctx, async (tx) => {
		const result = await tx.execute(sql`
			update surplus_listings
			   set price_per_unit = ${pricePerUnit}
			 where id = ${listingId} and tenant_id = ${ctx.tenantId} and status in ('open', 'claimed')
			returning id
		`)
		if (result.length === 0) return false

		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (
				${ctx.tenantId}, ${listingId}, 'price_updated',
				${`Price set to ${pricePerUnit}.`},
				${now.toISOString()}
			)
		`)
		return true
	})

export const updateListingPickupWindow = async (
	ctx: SessionContext,
	listingId: string,
	pickupUntil: Date,
	now: Dayjs,
): Promise<boolean> =>
	withTenant(ctx, async (tx) => {
		const result = await tx.execute(sql`
			update surplus_listings
			   set pickup_until = ${pickupUntil.toISOString()}
			 where id = ${listingId} and tenant_id = ${ctx.tenantId} and status in ('open', 'claimed')
			returning id
		`)
		if (result.length === 0) return false

		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (
				${ctx.tenantId}, ${listingId}, 'pickup_extended',
				${`Pickup-until set to ${pickupUntil.toISOString()}.`},
				${now.toISOString()}
			)
		`)
		return true
	})

export const cancelListing = async (
	ctx: SessionContext,
	listingId: string,
	now: Dayjs,
): Promise<boolean> =>
	withTenant(ctx, async (tx) => {
		const result = await tx.execute(sql`
			update surplus_listings
			   set status = 'cancelled', claimed_by_tenant_id = null, claimed_at = null
			 where id = ${listingId} and tenant_id = ${ctx.tenantId} and status in ('open', 'claimed')
			returning id
		`)
		if (result.length === 0) return false

		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (
				${ctx.tenantId}, ${listingId}, 'cancelled',
				${`Cancelled by ${ctx.userId || "owner"}.`},
				${now.toISOString()}
			)
		`)
		return true
	})

export const completeListing = async (
	ctx: SessionContext,
	listingId: string,
	now: Dayjs,
): Promise<boolean> => {
	if (ctx.tenantType === "restaurant") {
		return withTenant(ctx, async (tx) => {
			const result = await tx.execute(sql`
				update surplus_listings
				   set status = 'completed', completed_at = ${now.toISOString()}
				 where id = ${listingId} and tenant_id = ${ctx.tenantId} and status = 'claimed'
				returning id
			`)
			if (result.length === 0) return false

			await tx.execute(sql`
				insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
				values (
					${ctx.tenantId}, ${listingId}, 'collected',
					${`Collected by owner for ${ctx.tenantId}.`},
					${now.toISOString()}
				)
			`)
			return true
		})
	}
	return withSuperAdmin(async (tx) => {
		const result = await tx.execute(sql`
			update surplus_listings
			   set status = 'completed', completed_at = ${now.toISOString()}
			 where id = ${listingId} and claimed_by_tenant_id = ${ctx.tenantId} and status = 'claimed'
			returning id, tenant_id
		`)
		if (result.length === 0) return false
		const ownerTenantId = String(result[0]?.tenant_id ?? "")
		if (ownerTenantId === "") return false

		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (
				${ownerTenantId}, ${listingId}, 'collected',
				${`Collected by ${ctx.tenantId}.`},
				${now.toISOString()}
			)
		`)
		return true
	})
}

export const markListingNoShow = async (
	ctx: SessionContext,
	listingId: string,
	now: Dayjs,
): Promise<boolean> =>
	withTenant(ctx, async (tx) => {
		const result = await tx.execute(sql`
			update surplus_listings
			   set status = 'open',
			       claimed_by_tenant_id = null,
			       claimed_at = null
			 where id = ${listingId} and tenant_id = ${ctx.tenantId} and status = 'claimed'
			returning id
		`)
		if (result.length === 0) return false

		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (
				${ctx.tenantId}, ${listingId}, 'no_show',
				${`No-show reported by ${ctx.tenantId}.`},
				${now.toISOString()}
			)
		`)
		return true
	})
