import { Elysia } from "elysia"
import { z } from "zod"
import { systemClock } from "../../shared/clock"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { getDashboard, resolveRange } from "./analytics.service"

const dateParam = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
	.or(z.literal(""))
	.default("")

const dashboardQuerySchema = z.object({
	from: dateParam,
	to: dateParam,
})

export const analyticsRoute = new Elysia({ prefix: "/v1" })
	.use(sessionPlugin)
	.get("/dashboard", async ({ session, query }) => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		const input = dashboardQuerySchema.parse(query)
		return getDashboard(active, resolveRange(input, systemClock))
	})
