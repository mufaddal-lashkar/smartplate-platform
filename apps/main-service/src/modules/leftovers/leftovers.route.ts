import { Elysia } from "elysia"
import { systemClock } from "../../shared/clock"
import { requirePermission, requireTenantType } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import {
	commitDispositionsSchema,
	listLeftoversQuerySchema,
	recordLeftoverSchema,
} from "./leftovers.schema"
import {
	commitDispositions,
	listLeftovers,
	recordLeftover,
	suggestDisposition,
} from "./leftovers.service"

export const leftoversRoute = new Elysia({ prefix: "/v1/leftovers" })
	.use(sessionPlugin)
	.get("/", async ({ session, query }) => {
		const active = requireSession(session)
		requireTenantType(active, "restaurant")
		await requirePermission(active, "reports.read")

		const parsed = listLeftoversQuerySchema.parse({
			serviceDate: query.serviceDate ?? "",
		})

		return { items: await listLeftovers(active, parsed.serviceDate), nextCursor: "" }
	})
	.post("/", async ({ session, body }) => {
		const active = requireSession(session)
		requireTenantType(active, "restaurant")
		await requirePermission(active, "leftover.write")

		return recordLeftover(active, recordLeftoverSchema.parse(body), systemClock)
	})
	.post("/dispositions", async ({ session, body }) => {
		const active = requireSession(session)
		requireTenantType(active, "restaurant")
		await requirePermission(active, "disposition.decide")

		return commitDispositions(active, commitDispositionsSchema.parse(body), systemClock)
	})
	.get("/:id/disposition-suggestion", async ({ session, params }) => {
		const active = requireSession(session)
		requireTenantType(active, "restaurant")
		await requirePermission(active, "disposition.decide")

		return suggestDisposition(active, params.id, systemClock)
	})
