import { Elysia, t } from "elysia"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { archiveUserSchema, inviteUserSchema, updateUserSchema, userIdParam } from "./users.schema"
import { archiveUser, findUserInTenant, inviteUser, listUsers, updateUser } from "./users.service"

export const usersRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/users", async ({ session }) => {
		const active = requireSession(session)
		await requirePermission(active, "users.manage")
		const items = await listUsers(active)
		return { items, nextCursor: "" }
	})
	.post(
		"/v1/users",
		async ({ body, session }) => {
			const active = requireSession(session)
			await requirePermission(active, "users.manage")
			const input = inviteUserSchema.parse(body)
			return inviteUser(active, input)
		},
		{
			body: t.Object({
				email: t.String(),
				name: t.String(),
				role: t.Union([
					t.Literal("owner"),
					t.Literal("staff"),
					t.Literal("ngo_admin"),
					t.Literal("ngo_volunteer"),
				]),
			}),
		},
	)
	.get("/v1/users/:id", async ({ params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "users.manage")
		const { id } = userIdParam.parse(params)
		return findUserInTenant(active, id)
	})
	.patch(
		"/v1/users/:id",
		async ({ body, params, session }) => {
			const active = requireSession(session)
			await requirePermission(active, "users.manage")
			const { id } = userIdParam.parse(params)
			const input = updateUserSchema.parse(body)
			return updateUser(active, id, input)
		},
		{
			body: t.Object({
				name: t.Optional(t.String()),
				role: t.Optional(
					t.Union([
						t.Literal("owner"),
						t.Literal("staff"),
						t.Literal("ngo_admin"),
						t.Literal("ngo_volunteer"),
					]),
				),
			}),
		},
	)
	.delete(
		"/v1/users/:id",
		async ({ body, params, session }) => {
			const active = requireSession(session)
			await requirePermission(active, "users.manage")
			const { id } = userIdParam.parse(params)
			const input = archiveUserSchema.parse(body ?? {})
			return archiveUser(active, id, input)
		},
		{
			body: t.Object({ archived: t.Boolean() }),
		},
	)
