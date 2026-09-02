import { Elysia } from "elysia"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { preferencesPutSchema } from "./preferences.schema"
import { listMyPreferences, replaceMyPreferences } from "./preferences.service"

export const notificationPreferencesRoute = new Elysia({ prefix: "/v1/notification-preferences" })
	.use(sessionPlugin)
	.get("/", async ({ session }) => {
		const active = requireSession(session)
		await requirePermission(active, "settings.write")
		const preferences = await listMyPreferences(active)
		return { preferences }
	})
	.put("/", async ({ body, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "settings.write")
		const input = preferencesPutSchema.parse(body)
		const preferences = await replaceMyPreferences(active, input)
		return { preferences }
	})
