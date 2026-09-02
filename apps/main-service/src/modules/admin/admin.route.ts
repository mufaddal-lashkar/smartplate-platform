import { Elysia, t } from "elysia"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { getAdminAnalytics } from "./analytics.service"
import { getTenant, listTenants } from "./tenants.service"
import { verifyDecisionSchema } from "./verify.schema"
import { decideVerification } from "./verify.service"

export const adminRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/admin/tenants", async ({ session }) => {
		const active = requireSession(session)
		await requirePermission(active, "ngo.verify")
		return { items: await listTenants(), nextCursor: "" }
	})
	.get("/v1/admin/tenants/:id", async ({ params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "ngo.verify")
		return getTenant(params.id)
	})
	.post(
		"/v1/admin/tenants/:id/verify",
		async ({ body, params, session }) => {
			const active = requireSession(session)
			await requirePermission(active, "ngo.verify")
			const input = verifyDecisionSchema.parse(body)
			return decideVerification(active, params.id, input)
		},
		{
			body: t.Object({
				decision: t.Union([t.Literal("approve"), t.Literal("reject")]),
				rejectionReason: t.Optional(t.String()),
			}),
		},
	)
	.get("/v1/admin/analytics", async ({ session }) => {
		const active = requireSession(session)
		await requirePermission(active, "platform.analytics")
		return getAdminAnalytics()
	})
