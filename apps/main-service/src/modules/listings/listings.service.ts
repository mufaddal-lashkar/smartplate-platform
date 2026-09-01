import { Queue } from "bullmq"
import type { SessionContext } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import type { Clock } from "../../shared/clock"
import { createRedis } from "../../shared/redis"
import { publishEvent } from "../events/events.service"
import {
	cancelListing,
	completeListing,
	escalateOpenB2b,
	type ListingWithEvents,
	markListingNoShow,
	selectDueEscalations,
	selectListings,
	updateListingPickupWindow,
	updateListingPrice,
} from "./listings.queries"

export const ESCALATION_QUEUE = "escalation"
export const ESCALATION_JOB = "escalate"
export const ESCALATION_SWEEP_JOB = "sweep"
export const ESCALATION_SWEEP_MS = 60_000

const SWEEP_BATCH = 200
const DEFAULT_WINDOW_SECONDS = 30

export type EscalationJob = {
	listingId: string
	tenantId: string
}

export const escalationQueue = new Queue<EscalationJob>(ESCALATION_QUEUE, {
	connection: createRedis(),
})

export const escalationWindowSeconds = (): number => {
	const configured = Number(process.env.ESCALATION_WINDOW_SECONDS ?? "")
	return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WINDOW_SECONDS
}

export const listListings = async (ctx: SessionContext): Promise<ListingWithEvents[]> =>
	selectListings(ctx)

export const escalateListing = async (
	listingId: string,
	tenantId: string,
	clock: Clock,
): Promise<boolean> => {
	const escalated = await escalateOpenB2b(listingId, tenantId, clock.now())
	if (!escalated) return false

	await publishEvent(tenantId, {
		topic: "market",
		name: "listing.escalated",
		data: { listingId },
	})
	return true
}

export const scheduleEscalation = async (listingId: string, tenantId: string): Promise<void> => {
	await escalationQueue.add(
		ESCALATION_JOB,
		{ listingId, tenantId },
		{ delay: escalationWindowSeconds() * 1000, removeOnComplete: true, removeOnFail: 100 },
	)
}

export const sweepDueEscalations = async (clock: Clock): Promise<number> => {
	const due = await selectDueEscalations(clock.now(), SWEEP_BATCH)

	let escalated = 0
	for (const listing of due) {
		if (await escalateListing(listing.listingId, listing.tenantId, clock)) escalated += 1
	}
	return escalated
}

export const patchListing = async (
	ctx: SessionContext,
	listingId: string,
	input: { pricePerUnit?: string; pickupUntil?: Date },
	clock: Clock,
): Promise<{ listingId: string }> => {
	if (input.pricePerUnit == null && input.pickupUntil == null) {
		throw new ApiError("VALIDATION_FAILED", "Provide pricePerUnit or pickupUntil to update.")
	}
	const now = clock.now()
	if (input.pricePerUnit != null) {
		const ok = await updateListingPrice(ctx, listingId, input.pricePerUnit, now)
		if (!ok) throw new ApiError("RESOURCE_NOT_FOUND", "That listing cannot be edited.")
	}
	if (input.pickupUntil != null) {
		const ok = await updateListingPickupWindow(ctx, listingId, input.pickupUntil, now)
		if (!ok) throw new ApiError("RESOURCE_NOT_FOUND", "That listing cannot be edited.")
	}
	await publishEvent(ctx.tenantId, {
		topic: "market",
		name: "listing.updated",
		data: { listingId, entityId: listingId },
	})
	return { listingId }
}

export const cancelOwnListing = async (
	ctx: SessionContext,
	listingId: string,
	clock: Clock,
): Promise<{ listingId: string }> => {
	const ok = await cancelListing(ctx, listingId, clock.now())
	if (!ok) throw new ApiError("RESOURCE_NOT_FOUND", "That listing cannot be cancelled.")
	await publishEvent(ctx.tenantId, {
		topic: "market",
		name: "listing.cancelled",
		data: { listingId, entityId: listingId },
	})
	return { listingId }
}

export const completeOwnListing = async (
	ctx: SessionContext,
	listingId: string,
	clock: Clock,
): Promise<{ listingId: string }> => {
	const ok = await completeListing(ctx, listingId, clock.now())
	if (!ok) throw new ApiError("RESOURCE_NOT_FOUND", "That listing cannot be completed.")
	await publishEvent(ctx.tenantId, {
		topic: "market",
		name: "listing.collected",
		data: { listingId, entityId: listingId },
	})
	return { listingId }
}

export const reportNoShow = async (
	ctx: SessionContext,
	listingId: string,
	clock: Clock,
): Promise<{ listingId: string }> => {
	const ok = await markListingNoShow(ctx, listingId, clock.now())
	if (!ok) throw new ApiError("RESOURCE_NOT_FOUND", "That listing is not claimed.")
	await publishEvent(ctx.tenantId, {
		topic: "market",
		name: "listing.no_show",
		data: { listingId, entityId: listingId },
	})
	return { listingId }
}
