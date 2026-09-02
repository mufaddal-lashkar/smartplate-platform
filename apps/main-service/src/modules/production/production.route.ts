import type { Collection } from "@smartplate/contracts/envelope"
import { Elysia, t } from "elysia"
import type { PrepEntry, ReuseConfirmation } from "../../db/schema"
import { systemClock } from "../../shared/clock"
import { readIdempotent, requireIdempotencyKey, writeIdempotent } from "../../shared/idempotency"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import type { PrepEntryWithDish, ReusePending } from "./production.queries"
import {
	prepEntryInputSchema,
	prepEntryPatchSchema,
	reuseConfirmationInputSchema,
} from "./production.schema"
import {
	createPrepEntry,
	getPrepEntry,
	getReuseHistory,
	listPrepEntriesForDate,
	listReusePending,
	patchPrepEntry,
	recordReuseConfirmation,
} from "./production.service"

type PrepResponse = { prepEntry: PrepEntry }
type IdempotencyEnvelope<T> = { idempotent: false; data: T } | { idempotent: true; data: T }

const wrapIdempotent = <T>(response: T, hit: boolean): IdempotencyEnvelope<T> =>
	hit ? { idempotent: true, data: response } : { idempotent: false, data: response }

export const productionRoute = new Elysia()
	.use(sessionPlugin)
	.get(
		"/v1/prep-entries",
		async ({ query, session }): Promise<Collection<PrepEntryWithDish>> => {
			const active = requireSession(session)
			await requirePermission(active, "prep.write")
			const serviceDate = query.serviceDate ?? ""
			return { items: await listPrepEntriesForDate(active, serviceDate), nextCursor: "" }
		},
		{
			query: t.Object({
				serviceDate: t.Optional(t.String()),
			}),
		},
	)
	.get("/v1/prep-entries/:id", async ({ params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "prep.write")
		return getPrepEntry(active, params.id)
	})
	.post(
		"/v1/prep-entries",
		async ({ body, request, session }): Promise<IdempotencyEnvelope<PrepResponse>> => {
			const active = requireSession(session)
			await requirePermission(active, "prep.write")
			const key = requireIdempotencyKey({ request })
			const input = prepEntryInputSchema.parse(body)

			const cached = await readIdempotent<PrepResponse>(active.tenantId, key, input)
			if (cached != null) return wrapIdempotent(cached, true)

			const prepEntry = await createPrepEntry(active, input, systemClock)
			const response: PrepResponse = { prepEntry }
			await writeIdempotent(active.tenantId, key, input, response)
			return wrapIdempotent(response, false)
		},
	)
	.patch("/v1/prep-entries/:id", async ({ body, params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "prep.write")
		return patchPrepEntry(active, params.id, prepEntryPatchSchema.parse(body))
	})
	.get("/v1/leftovers/reuse-pending", async ({ session }): Promise<Collection<ReusePending>> => {
		const active = requireSession(session)
		await requirePermission(active, "disposition.decide")
		return { items: await listReusePending(active), nextCursor: "" }
	})
	.post("/v1/leftovers/:id/reuse-confirmation", async ({ body, params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "disposition.decide")
		return recordReuseConfirmation(
			active,
			params.id,
			reuseConfirmationInputSchema.parse(body),
			systemClock,
		)
	})
	.get(
		"/v1/leftovers/:id/reuse-confirmations",
		async ({ params, session }): Promise<Collection<ReuseConfirmation>> => {
			const active = requireSession(session)
			await requirePermission(active, "disposition.decide")
			return { items: await getReuseHistory(active, params.id), nextCursor: "" }
		},
	)
