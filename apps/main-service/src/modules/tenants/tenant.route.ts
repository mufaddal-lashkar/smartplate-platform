import { Elysia, t } from "elysia"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { updateTenantSchema } from "./tenant.schema"
import { findTenant, updateTenant } from "./tenant.service"

export const tenantRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/tenant", async ({ session }) => {
		const active = requireSession(session)
		return findTenant(active)
	})
	.patch(
		"/v1/tenant",
		async ({ body, session }) => {
			const active = requireSession(session)
			await requirePermission(active, "settings.write")
			const input = updateTenantSchema.parse(body)
			return updateTenant(active, input)
		},
		{
			body: t.Object({
				name: t.Optional(t.String()),
			}),
		},
	)
