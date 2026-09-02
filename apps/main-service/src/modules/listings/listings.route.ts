import type { Collection } from "@smartplate/contracts/envelope"
import { Elysia, t } from "elysia"
import { systemClock } from "../../shared/clock"
import { readIdempotent, requireIdempotencyKey, writeIdempotent } from "../../shared/idempotency"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import type { ListingWithEvents } from "./listings.queries"
import {
	cancelOwnListing,
	completeOwnListing,
	listListings,
	patchListing,
	reportNoShow,
} from "./listings.service"

type PatchResponse = { listingId: string }
type LifecycleResponse = { listingId: string }
type IdempotencyEnvelope<T> = { idempotent: false; data: T } | { idempotent: true; data: T }

const wrapIdempotent = <T>(response: T, hit: boolean): IdempotencyEnvelope<T> =>
	hit ? { idempotent: true, data: response } : { idempotent: false, data: response }

export const listingsRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/listings", async ({ session }): Promise<Collection<ListingWithEvents>> => {
		const active = requireSession(session)
		await requirePermission(active, "reports.read")
		return { items: await listListings(active), nextCursor: "" }
	})
	.patch(
		"/v1/listings/:id",
		async ({ body, params, session }): Promise<PatchResponse> => {
			const active = requireSession(session)
			await requirePermission(active, "listing.price")
			const input = {
				pricePerUnit: body.pricePerUnit,
				pickupUntil: body.pickupUntil ? new Date(body.pickupUntil) : null,
			}
			return patchListing(active, params.id, input, systemClock)
		},
		{
			body: t.Object({
				pricePerUnit: t.Optional(t.String()),
				pickupUntil: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/v1/listings/:id/cancel",
		async ({ params, request, session }): Promise<IdempotencyEnvelope<LifecycleResponse>> => {
			const active = requireSession(session)
			await requirePermission(active, "listing.price")
			const key = requireIdempotencyKey({ request })
			const cached = await readIdempotent<LifecycleResponse>(active.tenantId, key, {
				listingId: params.id,
			})
			if (cached != null) return wrapIdempotent(cached, true)
			const response = await cancelOwnListing(active, params.id, systemClock)
			await writeIdempotent(active.tenantId, key, { listingId: params.id }, response)
			return wrapIdempotent(response, false)
		},
	)
	.post(
		"/v1/listings/:id/complete",
		async ({ params, request, session }): Promise<IdempotencyEnvelope<LifecycleResponse>> => {
			const active = requireSession(session)
			await requirePermission(active, "listing.complete")
			const key = requireIdempotencyKey({ request })
			const cached = await readIdempotent<LifecycleResponse>(active.tenantId, key, {
				listingId: params.id,
			})
			if (cached != null) return wrapIdempotent(cached, true)
			const response = await completeOwnListing(active, params.id, systemClock)
			await writeIdempotent(active.tenantId, key, { listingId: params.id }, response)
			return wrapIdempotent(response, false)
		},
	)
	.post(
		"/v1/listings/:id/no-show",
		async ({ params, request, session }): Promise<IdempotencyEnvelope<LifecycleResponse>> => {
			const active = requireSession(session)
			await requirePermission(active, "listing.complete")
			const key = requireIdempotencyKey({ request })
			const cached = await readIdempotent<LifecycleResponse>(active.tenantId, key, {
				listingId: params.id,
			})
			if (cached != null) return wrapIdempotent(cached, true)
			const response = await reportNoShow(active, params.id, systemClock)
			await writeIdempotent(active.tenantId, key, { listingId: params.id }, response)
			return wrapIdempotent(response, false)
		},
	)
