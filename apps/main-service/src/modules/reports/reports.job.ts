import { Queue } from "bullmq"
import type { SessionContext } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { createRedis } from "../../shared/redis"
import { findReportForTenant, updateReportStatus } from "./reports.queries"
import { newReportId, renderReport } from "./reports.service"

export const REPORTS_QUEUE = "reports"
export const REPORTS_RENDER_JOB = "render"
export const REPORTS_SWEEP_JOB = "sweep"
export const REPORTS_SWEEP_MS = 24 * 60 * 60 * 1000

export type ReportsJob = {
	reportId: string
	tenantId: string
}

const systemCtxFor = (tenantId: string): SessionContext => ({
	tenantId,
	tenantType: "restaurant",
	role: "owner",
	userId: "",
})

export const reportsQueue = new Queue<ReportsJob>(REPORTS_QUEUE, {
	connection: createRedis(),
})

export const scheduleReportRender = async (reportId: string, tenantId: string): Promise<void> => {
	await reportsQueue.add(
		REPORTS_RENDER_JOB,
		{ reportId, tenantId },
		{ removeOnComplete: true, removeOnFail: 100, attempts: 1 },
	)
}

export const runReportJob = async (data: ReportsJob): Promise<{ status: string }> => {
	const ctx = systemCtxFor(data.tenantId)
	const report = await findReportForTenant(ctx, data.reportId)
	if (!report) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Report not found")
	}
	const result = await renderReport(report)
	if (!result) {
		return { status: "missing" }
	}
	return { status: result.status }
}

export const scheduleSweep = async (): Promise<void> => {
	await reportsQueue.upsertJobScheduler(
		REPORTS_SWEEP_JOB,
		{ every: REPORTS_SWEEP_MS },
		{ name: REPORTS_SWEEP_JOB, data: { reportId: "", tenantId: "" } },
	)
}

export const runSweepJob = async (): Promise<{ ok: true }> => {
	return { ok: true }
}

export { newReportId, updateReportStatus }
