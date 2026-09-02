import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { mkdir, rename } from "node:fs/promises"
import { join, resolve as resolvePath, sep } from "node:path"
import type { SessionContext } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { buildReportTable, type ReportTable } from "../analytics/analytics.service"
import { renderCsv } from "./renderers/csv"
import { renderPdf } from "./renderers/pdf"
import { renderXlsx } from "./renderers/xlsx"
import {
	deleteReportArtifact,
	findReportForTenant,
	insertReport,
	listReportsForTenant,
	updateReportStatus,
} from "./reports.queries"
import type { CreateReportInput, ReportFormat, ReportRecord } from "./reports.schema"

export const REPORTS_DIR = resolvePath(process.cwd(), ".runtime", "reports")
export const URL_TTL_SECONDS = 5 * 60
export const ARTIFACT_RETENTION_DAYS = 30

const SIGNING_SECRET = process.env.REPORTS_SIGNING_SECRET ?? "dev-reports-secret"

const extensionFor = (format: ReportFormat): string => {
	if (format === "csv") return "csv"
	if (format === "pdf") return "pdf"
	return "xlsx"
}

const renderArtifact = async (format: ReportFormat, table: ReportTable): Promise<Uint8Array> => {
	if (format === "csv") return renderCsv(table)
	if (format === "pdf") return renderPdf(table.title, table)
	return renderXlsx(table.title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 28) || "Report", table)
}

export const enqueueReport = async (
	ctx: SessionContext,
	restaurantId: string,
	input: CreateReportInput,
): Promise<ReportRecord> => {
	return insertReport(ctx, { ...input, restaurantId })
}

export const renderReport = async (report: ReportRecord): Promise<ReportRecord | null> => {
	const ctx: SessionContext = {
		tenantId: report.tenantId,
		tenantType: "restaurant",
		role: "owner",
		userId: "",
	}
	const start = Date.now()
	const updated = await updateReportStatus(ctx, report.id, "running", {})
	if (!updated) return null
	const table = await buildReportTable(ctx, report.reportType, {
		from: report.periodStart,
		to: report.periodEnd,
	})
	const bytes = await renderArtifact(report.format, table)
	const dir = join(REPORTS_DIR, report.tenantId)
	await mkdir(dir, { recursive: true })
	const finalPath = join(dir, `${report.id}.${extensionFor(report.format)}`)
	const tmpPath = `${finalPath}.tmp`
	try {
		await Bun.write(tmpPath, bytes)
		await rename(tmpPath, finalPath)
	} catch (e) {
		try {
			await Bun.write(tmpPath, "")
			const file = Bun.file(tmpPath)
			if (await file.exists()) await file.delete()
		} catch {}
		const message = e instanceof Error ? e.message : "report render failed"
		console.error(`[reports] render failed for ${report.id}:`, e)
		return updateReportStatus(ctx, report.id, "failed", { error: message })
	}
	const result = await updateReportStatus(ctx, report.id, "succeeded", { artifactPath: finalPath })
	console.log(`[reports] ${report.id} (${report.format}) rendered in ${Date.now() - start}ms`)
	return result
}

export const listReports = async (ctx: SessionContext): Promise<ReportRecord[]> => {
	return listReportsForTenant(ctx)
}

export const getReport = async (
	ctx: SessionContext,
	reportId: string,
): Promise<ReportRecord | null> => findReportForTenant(ctx, reportId)

const safeReportsPath = (relPath: string): string | null => {
	const root = REPORTS_DIR
	const abs = resolvePath(root, relPath)
	if (abs === root) return null
	const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`
	if (!abs.startsWith(rootWithSep) && !abs.startsWith(`${root}/`)) {
		return null
	}
	return abs
}

const signPayload = (payload: string): string => {
	return createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex")
}

const timingSafeHexEqual = (a: string, b: string): boolean => {
	if (a.length !== b.length) return false
	try {
		return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
	} catch {
		return false
	}
}

export const signDownloadUrl = (report: ReportRecord, baseUrl: string): string => {
	const exp = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS
	const rel = `${report.tenantId}/${report.id}.${extensionFor(report.format)}`
	const payload = `${rel}|${exp}`
	const sig = signPayload(payload)
	const params = new URLSearchParams({ path: rel, exp: String(exp), sig })
	return `${baseUrl}/api/reports/dl?${params.toString()}`
}

export type VerifyResult =
	| { ok: true; absolutePath: string; filename: string }
	| { ok: false; reason: "missing" | "expired" | "bad-signature" | "bad-path" }

export const verifySignedPath = (path: string, exp: string, sig: string): VerifyResult => {
	if (!path || !exp || !sig) return { ok: false, reason: "missing" }
	const expNum = Number(exp)
	if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) {
		return { ok: false, reason: "expired" }
	}
	const expected = signPayload(`${path}|${exp}`)
	if (!timingSafeHexEqual(expected, sig)) {
		return { ok: false, reason: "bad-signature" }
	}
	const abs = safeReportsPath(path)
	if (!abs) return { ok: false, reason: "bad-path" }
	const filename = path.split("/").pop() ?? "report"
	return { ok: true, absolutePath: abs, filename }
}

export const downloadReportForSession = async (
	ctx: SessionContext,
	reportId: string,
): Promise<{ url: string; record: ReportRecord }> => {
	const record = await findReportForTenant(ctx, reportId)
	if (!record) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Report not found")
	}
	if (record.status !== "succeeded" || record.artifactPath === "") {
		throw new ApiError("REPORT_NOT_READY", "Report is not yet ready")
	}
	const url = signDownloadUrl(record, "")
	return { url, record }
}

export const sweepOldReports = async (): Promise<{ deleted: number }> => {
	const cutoff = new Date(Date.now() - ARTIFACT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
	const ctx: SessionContext = {
		tenantId: "system",
		tenantType: "restaurant",
		role: "super_admin",
		userId: "system",
	}
	const rows = await listReportsForTenant(ctx, 1000)
	let deleted = 0
	for (const row of rows) {
		if (row.status !== "succeeded") continue
		if (!row.finishedAt) continue
		if (new Date(row.finishedAt) > cutoff) continue
		await deleteReportArtifact(row.artifactPath)
		deleted += 1
	}
	return { deleted }
}

export const newReportId = (): string => randomUUID()
