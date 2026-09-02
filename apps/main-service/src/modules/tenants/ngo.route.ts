import { Elysia, t } from "elysia"
import { requirePermission, requireTenantType } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { submitVerificationSchema, updateNgoSchema } from "./ngo.schema"
import { findNgo, submitVerification, updateNgo } from "./ngo.service"

export const ngoRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/ngo", async ({ session }) => {
		const active = requireSession(session)
		requireTenantType(active, "ngo")
		return findNgo(active)
	})
	.patch(
		"/v1/ngo",
		async ({ body, session }) => {
			const active = requireSession(session)
			requireTenantType(active, "ngo")
			await requirePermission(active, "settings.write")
			const input = updateNgoSchema.parse(body)
			return updateNgo(active, input)
		},
		{
			body: t.Object({
				name: t.Optional(t.String()),
				contactPhone: t.Optional(t.String()),
				activeFrom: t.Optional(t.String()),
				activeTo: t.Optional(t.String()),
				serviceRadiusKm: t.Optional(t.String()),
				latitude: t.Optional(t.String()),
				longitude: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/v1/ngo/verification",
		async ({ body, session }) => {
			const active = requireSession(session)
			requireTenantType(active, "ngo")
			await requirePermission(active, "verification.submit")
			const input = submitVerificationSchema.parse(body)
			return submitVerification(active, input)
		},
		{
			body: t.Object({
				registrationNo: t.String(),
				contactName: t.String(),
				contactPhone: t.String(),
				notes: t.Optional(t.String()),
			}),
		},
	)
