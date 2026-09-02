import { Elysia } from "elysia"
import { z } from "zod"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { requireInsightOrThrow } from "./insights.service"

const dateParam = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
	.or(z.literal(""))
	.default("")

const insightsQuerySchema = z.object({
	from: dateParam,
	to: dateParam,
})

export const insightsRoute = new Elysia({ prefix: "/v1" })
	.use(sessionPlugin)
	.get("/insights", async ({ session, query }) => {
		const active = requireSession(session)
		await requirePermission(active, "reports.read")
		insightsQuerySchema.parse(query)
		return requireInsightOrThrow(active)
	})
