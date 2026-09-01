import { Elysia } from "elysia"
import { systemClock } from "../../shared/clock"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { dateRangeSchema, forecastsQuerySchema } from "./analytics.schema"
import {
	getDashboard,
	getDishes,
	getForecasts,
	getRecovery,
	getWaste,
	resolveRange,
} from "./analytics.service"

export const analyticsRoute = new Elysia({ prefix: "/v1" })
	.use(sessionPlugin)
	.get("/dashboard", async ({ session, query }) => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		const input = dateRangeSchema.parse(query)
		return getDashboard(active, resolveRange(input, systemClock))
	})
	.get("/analytics/waste", async ({ session, query }) => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		const input = dateRangeSchema.parse(query)
		return getWaste(active, resolveRange(input, systemClock), input.grain ?? "day")
	})
	.get("/analytics/recovery", async ({ session, query }) => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		const input = dateRangeSchema.parse(query)
		return getRecovery(active, resolveRange(input, systemClock), input.grain ?? "day")
	})
	.get("/analytics/dishes", async ({ session, query }) => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		const input = dateRangeSchema.parse(query)
		return getDishes(active, resolveRange(input, systemClock))
	})
	.get("/forecasts", async ({ session, query }) => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		const input = forecastsQuerySchema.parse(query)
		return getForecasts(active, resolveRange(input, systemClock))
	})
