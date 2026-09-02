import { eq } from "drizzle-orm"
import { Elysia } from "elysia"
import { restaurants } from "../../db/schema"
import { withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { scheduleReportRender } from "./reports.job"
import { createReportSchema } from "./reports.schema"
import { enqueueReport, getReport, listReports, signDownloadUrl } from "./reports.service"

const requireRestaurantId = async (ctx: {
	tenantId: string
	tenantType: "restaurant" | "ngo"
	role: "owner" | "staff" | "super_admin" | "ngo_admin" | "ngo_volunteer"
	userId: string
}): Promise<string> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select({ id: restaurants.id })
			.from(restaurants)
			.where(eq(restaurants.tenantId, ctx.tenantId))
			.limit(1)
		const row = rows[0]
		if (!row) {
			throw new ApiError("RESOURCE_NOT_FOUND", "No restaurant for this tenant")
		}
		return row.id
	})

export const reportsRoute = new Elysia({ prefix: "/v1" })
	.use(sessionPlugin)
	.post(
		"/reports",
		async ({ session, body, set }) => {
			const active = requireSession(session)
			await requirePermission(active, "reports.read")
			const input = createReportSchema.parse(body)
			const restaurantId = await requireRestaurantId(active)
			const record = await enqueueReport(active, restaurantId, input)
			await scheduleReportRender(record.id, active.tenantId)
			set.status = 202
			return { jobId: record.id, status: record.status }
		},
		{ body: createReportSchema },
	)
	.get("/reports", async ({ session }) => {
		const active = requireSession(session)
		await requirePermission(active, "reports.read")
		return { reports: await listReports(active) }
	})
	.get("/reports/:id", async ({ session, params }) => {
		const active = requireSession(session)
		await requirePermission(active, "reports.read")
		const record = await getReport(active, params.id)
		if (!record) throw new ApiError("RESOURCE_NOT_FOUND", "Report not found")
		return record
	})
	.get("/reports/:id/download", async ({ session, params, request, set }) => {
		const active = requireSession(session)
		await requirePermission(active, "reports.read")
		const record = await getReport(active, params.id)
		if (!record) throw new ApiError("RESOURCE_NOT_FOUND", "Report not found")
		if (record.status !== "succeeded" || record.artifactPath === "") {
			throw new ApiError("REPORT_NOT_READY", "Report is not yet ready")
		}
		const origin = new URL(request.url).origin
		const url = signDownloadUrl(record, origin)
		set.status = 302
		set.headers.location = url
		return ""
	})
