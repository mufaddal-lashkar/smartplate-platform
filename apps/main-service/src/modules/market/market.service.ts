import type { SessionContext } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import type { Clock } from "../../shared/clock"
import { withinActiveWindow } from "../../shared/geo"
import { publishEvent } from "../events/events.service"
import { claimListing, releaseListing, selectListingForClaim } from "../listings/listings.queries"
import {
	findNgoActiveWindow,
	type MarketListingRow,
	selectMarketListings,
	selectNgoPickups,
	selectOwnMarketListings,
} from "./market.queries"

export const listBrowseableMarket = async (
	ctx: SessionContext,
	clock: Clock,
): Promise<MarketListingRow[]> => {
	const raw = await selectMarketListings(ctx)
	const otherListings = raw.filter((row) => row.tenantId !== ctx.tenantId)
	if (ctx.tenantType === "ngo") {
		const window = await findNgoActiveWindow(ctx.tenantId)
		if (window == null) return otherListings
		const now = clock.now()
		return otherListings.filter((row) =>
			withinActiveWindow(window.activeFrom, window.activeTo, now),
		)
	}
	return otherListings
}

export const listOwnMarket = async (ctx: SessionContext): Promise<MarketListingRow[]> =>
	selectOwnMarketListings(ctx.tenantId)

export const listNgoPickups = async (ctx: SessionContext): Promise<MarketListingRow[]> =>
	selectNgoPickups(ctx.tenantId)

export const claim = async (
	ctx: SessionContext,
	listingId: string,
	clock: Clock,
): Promise<{ listing: MarketListingRow }> => {
	const existing = await selectListingForClaim(listingId)
	if (existing == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "That listing no longer exists.")
	}
	if (existing.status !== "open" || existing.claimedByTenantId != null) {
		throw new ApiError("LISTING_UNAVAILABLE", "That listing is no longer open for claim.")
	}
	if (existing.tenantId === ctx.tenantId) {
		throw new ApiError("VALIDATION_FAILED", "You cannot claim your own listing.")
	}
	if (existing.channel === "b2b" && ctx.tenantType !== "restaurant") {
		throw new ApiError("TENANT_TYPE_MISMATCH", "B2B listings are for restaurants only.")
	}

	const now = clock.now()
	const ok = await claimListing(listingId, existing.tenantId, ctx.tenantId, now)
	if (!ok) {
		throw new ApiError("LISTING_UNAVAILABLE", "That listing was claimed by someone else.")
	}

	await publishEvent(existing.tenantId, {
		topic: "market",
		name: "listing.claimed",
		data: { listingId, claimedByTenantId: ctx.tenantId, channel: existing.channel },
	})
	await publishEvent(ctx.tenantId, {
		topic: "notifications",
		name: "market.claim.confirmed",
		data: { listingId, entityId: listingId },
	})

	const refreshed = await selectListingForClaim(listingId)
	if (refreshed == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "That listing no longer exists.")
	}
	return {
		listing: {
			id: refreshed.id,
			tenantId: refreshed.tenantId,
			channel: refreshed.channel,
			pricePerUnit: refreshed.pricePerUnit,
			qty: refreshed.qty,
			unit: refreshed.unit,
			pickupFrom: refreshed.pickupFrom.toISOString(),
			pickupUntil: refreshed.pickupUntil.toISOString(),
			safeUntil: refreshed.safeUntil.toISOString(),
			claimedByTenantId: refreshed.claimedByTenantId,
			restaurantName: "",
			restaurantCity: "",
		},
	}
}

export const release = async (
	ctx: SessionContext,
	listingId: string,
	clock: Clock,
): Promise<{ released: true }> => {
	const existing = await selectListingForClaim(listingId)
	if (existing == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "That listing no longer exists.")
	}
	if (existing.claimedByTenantId !== ctx.tenantId) {
		throw new ApiError("RESOURCE_NOT_FOUND", "You do not have a claim on that listing.")
	}
	const now = clock.now()
	const ok = await releaseListing(listingId, existing.tenantId, ctx.tenantId, now)
	if (!ok) {
		throw new ApiError("RESOURCE_NOT_FOUND", "That listing is no longer claimed by you.")
	}
	await publishEvent(existing.tenantId, {
		topic: "market",
		name: "listing.released",
		data: { listingId, releasedByTenantId: ctx.tenantId },
	})
	return { released: true }
}
