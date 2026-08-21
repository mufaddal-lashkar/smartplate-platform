import { Queue } from "bullmq"
import type { SessionContext } from "../../db/tx"
import type { Clock } from "../../shared/clock"
import { createRedis } from "../../shared/redis"
import { publishEvent } from "../events/events.service"
import {
	escalateOpenB2b,
	type ListingWithEvents,
	selectDueEscalations,
	selectListings,
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
