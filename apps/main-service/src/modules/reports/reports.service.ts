import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { mkdir, rename } from "node:fs/promises"
import { join, resolve as resolvePath, sep } from "node:path"
import dayjs from "dayjs"
import type { SessionContext } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { systemClock } from "../../shared/clock"
import {
	buildReportTable,
	type Dashboard,
	getDashboard,
	getDishes,
	getRecovery,
	getWaste,
	type ReportTable,
} from "../analytics/analytics.service"
import { renderCsv } from "./renderers/csv"
import {
	type ReportChartPoint,
	type ReportDocument,
	type ReportKpi,
	renderPdf,
	renderReportPdf,
} from "./renderers/pdf"
import { renderXlsx } from "./renderers/xlsx"
import {
	deleteReportArtifact,
	findReportForTenant,
	insertReport,
	listReportsForTenant,
	loadReportContext,
	type ReportContext,
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

const fmtPct = (value: number): string => `${(value * 100).toFixed(1)}%`
const fmtKg = (value: number): string => `${value.toFixed(1)} kg`
const fmtInr = (value: number): string => `INR ${value.toFixed(0)}`

const kpiEmphasis = (value: number, goodIsHigh: boolean): "good" | "warning" | "critical" => {
	if (goodIsHigh) {
		if (value >= 0.7) return "good"
		if (value >= 0.4) return "warning"
		return "critical"
	}
	if (value <= 0.1) return "good"
	if (value <= 0.25) return "warning"
	return "critical"
}

const reportTitleFor = (type: ReportRecord["reportType"]): string => {
	if (type === "waste") return "Waste report"
	if (type === "recovery") return "Recovery report"
	if (type === "dishes") return "Per-dish recovery report"
	return "Comprehensive report"
}

const buildKpis = (type: ReportRecord["reportType"], dashboard: Dashboard): ReportKpi[] => {
	if (type === "comprehensive") return buildComprehensiveKpis(dashboard)
	if (type === "waste") {
		return [
			{
				label: "Waste rate",
				value: fmtPct(dashboard.wasteRate),
				hint: "Of all prepared food in the period",
				emphasis: kpiEmphasis(dashboard.wasteRate, false),
			},
			{
				label: "Surplus rate",
				value: fmtPct(dashboard.surplusRate),
				hint: "Prepared food that became surplus",
				emphasis: "primary",
			},
			{
				label: "kg diverted",
				value: fmtKg(dashboard.kgDiverted),
				hint: "Reused, sold, or donated instead of binned",
				emphasis: "good",
			},
			{
				label: "Open listings",
				value: dashboard.openListings.toString(),
				hint: "Surplus currently offered to NGOs",
				emphasis: dashboard.openListings > 0 ? "primary" : "good",
			},
			{
				label: "Value recovered",
				value: fmtInr(dashboard.valueRecovered),
				hint: "Reused value + B2B proceeds",
				emphasis: "good",
			},
			{
				label: "Loss avoided",
				value: fmtInr(dashboard.lossAvoided),
				hint: "Value that would have been wasted",
				emphasis: "good",
			},
		]
	}
	if (type === "recovery") {
		return [
			{
				label: "Recovery rate",
				value: fmtPct(dashboard.recoveryRate),
				hint: "Of surplus food kept out of waste",
				emphasis: kpiEmphasis(dashboard.recoveryRate, true),
			},
			{
				label: "kg diverted",
				value: fmtKg(dashboard.kgDiverted),
				hint: "Reused + sold + donated",
				emphasis: "good",
			},
			{
				label: "Value recovered",
				value: fmtInr(dashboard.valueRecovered),
				hint: "Reused value + B2B proceeds",
				emphasis: "good",
			},
			{
				label: "Open listings",
				value: dashboard.openListings.toString(),
				hint: "Surplus currently offered to NGOs",
				emphasis: dashboard.openListings > 0 ? "primary" : "good",
			},
			{
				label: "Pending leftovers",
				value: fmtKg(dashboard.pendingLeftovers),
				hint: "Awaiting a recovery decision",
				emphasis: dashboard.pendingLeftovers > 0 ? "warning" : "good",
			},
			{
				label: "Unconvertible",
				value: fmtKg(dashboard.unconvertibleQty),
				hint: "Could not be safely recovered",
				emphasis: "critical",
			},
		]
	}
	return [
		{
			label: "Recovery rate",
			value: fmtPct(dashboard.recoveryRate),
			hint: "Across all dishes in the period",
			emphasis: kpiEmphasis(dashboard.recoveryRate, true),
		},
		{
			label: "kg diverted",
			value: fmtKg(dashboard.kgDiverted),
			hint: "Reused + sold + donated",
			emphasis: "good",
		},
		{
			label: "Value recovered",
			value: fmtInr(dashboard.valueRecovered),
			hint: "Reused value + B2B proceeds",
			emphasis: "good",
		},
		{
			label: "Loss avoided",
			value: fmtInr(dashboard.lossAvoided),
			hint: "Value kept out of waste",
			emphasis: "good",
		},
		{
			label: "Pending leftovers",
			value: fmtKg(dashboard.pendingLeftovers),
			hint: "Awaiting a recovery decision",
			emphasis: dashboard.pendingLeftovers > 0 ? "warning" : "good",
		},
		{
			label: "Open listings",
			value: dashboard.openListings.toString(),
			hint: "Currently offered to NGOs",
			emphasis: dashboard.openListings > 0 ? "primary" : "good",
		},
	]
}

const buildComprehensiveKpis = (dashboard: Dashboard): ReportKpi[] => [
	{
		label: "Waste rate",
		value: fmtPct(dashboard.wasteRate),
		hint: "Of all prepared food in the period",
		emphasis: kpiEmphasis(dashboard.wasteRate, false),
	},
	{
		label: "Recovery rate",
		value: fmtPct(dashboard.recoveryRate),
		hint: "Of surplus food kept out of waste",
		emphasis: kpiEmphasis(dashboard.recoveryRate, true),
	},
	{
		label: "Surplus rate",
		value: fmtPct(dashboard.surplusRate),
		hint: "Prepared food that became surplus",
		emphasis: "primary",
	},
	{
		label: "kg diverted",
		value: fmtKg(dashboard.kgDiverted),
		hint: "Reused + sold + donated",
		emphasis: "good",
	},
	{
		label: "Value recovered",
		value: fmtInr(dashboard.valueRecovered),
		hint: "Reused value + B2B proceeds",
		emphasis: "good",
	},
	{
		label: "Loss avoided",
		value: fmtInr(dashboard.lossAvoided),
		hint: "Value that would have been wasted",
		emphasis: "good",
	},
	{
		label: "Open listings",
		value: dashboard.openListings.toString(),
		hint: "Surplus currently offered to NGOs",
		emphasis: dashboard.openListings > 0 ? "primary" : "good",
	},
	{
		label: "Pending leftovers",
		value: fmtKg(dashboard.pendingLeftovers),
		hint: "Awaiting a recovery decision",
		emphasis: dashboard.pendingLeftovers > 0 ? "warning" : "good",
	},
]

const buildNarrative = (
	period: { from: string; to: string },
	dashboard: Dashboard,
	daysInRange: number,
): string[] => {
	const lines: string[] = []
	lines.push(
		`Over the last ${daysInRange} day${daysInRange === 1 ? "" : "s"} (${period.from} to ${period.to}), the kitchen diverted ${fmtKg(dashboard.kgDiverted)} of surplus from waste and recovered ${fmtInr(dashboard.valueRecovered)} in value.`,
	)
	lines.push(
		`Overall waste rate was ${fmtPct(dashboard.wasteRate)} of prepared food, with a recovery rate of ${fmtPct(dashboard.recoveryRate)} of surplus diverted away from bins.`,
	)
	if (dashboard.pendingLeftovers > 0) {
		lines.push(
			`There are ${fmtKg(dashboard.pendingLeftovers)} of leftovers still awaiting a recovery decision - consider listing them on the marketplace to avoid further loss.`,
		)
	} else {
		lines.push("No leftovers are currently awaiting a recovery decision.")
	}
	if (dashboard.openListings > 0) {
		lines.push(
			`${dashboard.openListings} surplus listing${dashboard.openListings === 1 ? " is" : "s are"} currently open to NGOs.`,
		)
	}
	return lines
}

const daysInRange = (from: string, to: string): number => {
	const start = dayjs(`${from}T00:00:00Z`)
	const end = dayjs(`${to}T00:00:00Z`)
	if (!start.isValid() || !end.isValid()) return 0
	const diff = end.diff(start, "day") + 1
	return diff > 0 ? diff : 0
}

const buildChart = async (
	ctx: SessionContext,
	type: ReportRecord["reportType"],
	range: { from: string; to: string },
): Promise<ReportDocument["chart"]> => {
	if (type === "comprehensive") {
		const [{ series: wasteSeries }, { series: recoverySeries }] = await Promise.all([
			getWaste(ctx, range, "day"),
			getRecovery(ctx, range, "day"),
		])
		const recoveryByBucket = new Map(recoverySeries.map((row) => [row.bucket, row]))
		const points: ReportChartPoint[] = wasteSeries.map((row) => {
			const r = recoveryByBucket.get(row.bucket)
			const recovered = r?.totalRecoveredKg ?? 0
			return {
				label: row.bucket,
				primary: Number(row.surplusKg.toFixed(3)),
				secondary: Number(recovered.toFixed(3)),
			}
		})
		return {
			title: "Daily surplus vs recovery (kg)",
			primaryLabel: "Surplus (kg)",
			secondaryLabel: "Recovered (kg)",
			points,
		}
	}
	if (type === "waste") {
		const { series } = await getWaste(ctx, range, "day")
		const points: ReportChartPoint[] = series.map((row) => ({
			label: row.bucket,
			primary: Number(row.surplusKg.toFixed(3)),
			secondary: Number(row.wasteKg.toFixed(3)),
		}))
		return {
			title: "Daily surplus vs waste (kg)",
			primaryLabel: "Surplus (kg)",
			secondaryLabel: "Waste (kg)",
			points,
		}
	}
	if (type === "recovery") {
		const { series } = await getRecovery(ctx, range, "day")
		const points: ReportChartPoint[] = series.map((row) => ({
			label: row.bucket,
			primary: Number(row.totalRecoveredKg.toFixed(3)),
			secondary: Number((row.reusedKg + row.soldKg + row.donatedKg).toFixed(3)),
		}))
		return {
			title: "Daily recovery (kg)",
			primaryLabel: "Total recovered",
			secondaryLabel: "Donated",
			points,
		}
	}
	const { dishes } = await getDishes(ctx, range)
	const points: ReportChartPoint[] = dishes.slice(0, 14).map((row) => ({
		label: row.name,
		primary: Number(row.reusedKg.toFixed(3)),
		secondary: Number(row.donatedKg.toFixed(3)),
	}))
	return {
		title: "Per-dish recovery (top 14)",
		primaryLabel: "Reused (kg)",
		secondaryLabel: "Donated (kg)",
		points,
	}
}

const buildReportDocument = async (
	report: ReportRecord,
	table: ReportTable,
	dashboard: Dashboard,
	rc: ReportContext,
): Promise<ReportDocument> => {
	const range = { from: report.periodStart, to: report.periodEnd }
	const chart = await buildChart(
		{
			tenantId: report.tenantId,
			tenantType: "restaurant",
			role: "owner",
			userId: "",
		},
		report.reportType,
		range,
	)
	const restaurant = rc.restaurant
	return {
		reportId: report.id,
		reportType: report.reportType,
		reportTitle: reportTitleFor(report.reportType),
		periodStart: report.periodStart,
		periodEnd: report.periodEnd,
		generatedAt: systemClock.now().toISOString(),
		org: {
			tenantName: rc.tenantName,
			restaurantName: restaurant?.name ?? reportTitleFor(report.reportType),
			addressLine: restaurant?.addressLine ?? "",
			city: restaurant?.city ?? "",
			state: restaurant?.state ?? "",
			pinCode: restaurant?.pinCode ?? "",
			cuisineType: restaurant?.cuisineType ?? "",
			gstNumber: restaurant?.gstNumber ?? "",
			contactPhone: restaurant?.contactPhone ?? "",
		},
		requester: rc.requester,
		narrative: buildNarrative(range, dashboard, daysInRange(range.from, range.to)),
		kpis: buildKpis(report.reportType, dashboard),
		chart,
		table,
	}
}

const renderArtifact = async (
	format: ReportFormat,
	table: ReportTable,
	document: ReportDocument | null,
): Promise<Uint8Array> => {
	if (format === "csv") return renderCsv(table)
	if (format === "pdf") {
		if (document) return renderReportPdf(document)
		return renderPdf(table.title, table)
	}
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
		userId: report.requestedByUserId,
	}
	const start = Date.now()
	const updated = await updateReportStatus(ctx, report.id, "running", {})
	if (!updated) return null
	const table = await buildReportTable(ctx, report.reportType, {
		from: report.periodStart,
		to: report.periodEnd,
	})
	let document: ReportDocument | null = null
	if (report.format === "pdf") {
		const [rc, dashboard] = await Promise.all([
			loadReportContext(report.tenantId, report.requestedByUserId),
			getDashboard(ctx, { from: report.periodStart, to: report.periodEnd }),
		])
		document = await buildReportDocument(report, table, dashboard, rc)
	}
	const bytes = await renderArtifact(report.format, table, document)
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
