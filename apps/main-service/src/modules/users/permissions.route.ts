import { Elysia, t } from "elysia"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import {
	listPermissionOverrides,
	removePermissionOverride,
	setPermissionOverride,
} from "./permissions.service"
import { userIdParam } from "./users.schema"

export const permissionsRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/users/:id/permissions", async ({ params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "users.manage")
		const { id } = userIdParam.parse(params)
		const items = await listPermissionOverrides(active, id)
		return { items, nextCursor: "" }
	})
	.put(
		"/v1/users/:id/permissions/:permission",
		async ({ params, body, session }) => {
			const active = requireSession(session)
			await requirePermission(active, "users.manage")
			const { id } = userIdParam.parse(params)
			return setPermissionOverride(active, id, params.permission, body.granted)
		},
		{
			body: t.Object({ granted: t.Boolean() }),
		},
	)
	.delete("/v1/users/:id/permissions/:permission", async ({ params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "users.manage")
		const { id } = userIdParam.parse(params)
		await removePermissionOverride(active, id, params.permission)
		return { ok: true }
	})
