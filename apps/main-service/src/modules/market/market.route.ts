import type { Collection } from "@smartplate/contracts/envelope"
import { Elysia } from "elysia"
import { systemClock } from "../../shared/clock"
import { readIdempotent, requireIdempotencyKey, writeIdempotent } from "../../shared/idempotency"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import type { MarketListingRow } from "./market.queries"
import {
	claim,
	listBrowseableMarket,
	listNgoPickups,
	listOwnMarket,
	release,
} from "./market.service"

type ClaimResponse = { listing: MarketListingRow }
type ReleaseResponse = { released: true }
type IdempotencyEnvelope<T> = { idempotent: false; data: T } | { idempotent: true; data: T }

const wrapIdempotent = <T>(response: T, hit: boolean): IdempotencyEnvelope<T> =>
	hit ? { idempotent: true, data: response } : { idempotent: false, data: response }

export const marketRoute = new Elysia({ prefix: "/v1/market" })
	.use(sessionPlugin)
	.get("/", async ({ session }): Promise<Collection<MarketListingRow>> => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		return { items: await listBrowseableMarket(active, systemClock), nextCursor: "" }
	})
	.get("/mine", async ({ session }): Promise<Collection<MarketListingRow>> => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		return { items: await listOwnMarket(active), nextCursor: "" }
	})
	.get("/pickups", async ({ session }): Promise<Collection<MarketListingRow>> => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		return { items: await listNgoPickups(active), nextCursor: "" }
	})
	.post(
		"/:id/claim",
		async ({ params, request, session }): Promise<IdempotencyEnvelope<ClaimResponse>> => {
			const active = requireSession(session)
			requirePermission(active, "listing.claim")
			const key = requireIdempotencyKey({ request })
			const cached = await readIdempotent<ClaimResponse>(active.tenantId, key, {
				listingId: params.id,
			})
			if (cached != null) return wrapIdempotent(cached, true)
			const response = await claim(active, params.id, systemClock)
			await writeIdempotent(active.tenantId, key, { listingId: params.id }, response)
			return wrapIdempotent(response, false)
		},
	)
	.post("/:id/release", async ({ params, session }): Promise<ReleaseResponse> => {
		const active = requireSession(session)
		requirePermission(active, "listing.claim")
		return release(active, params.id, systemClock)
	})
