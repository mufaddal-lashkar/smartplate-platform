import { and, desc, eq, sql } from "drizzle-orm"
import { reports, restaurants, tenants, users } from "../../db/schema"
import { type SessionContext, withSystem, withTenant } from "../../db/tx"
import type { ReportFormat, ReportRecord, ReportType } from "./reports.schema"

export const REPORT_STATUSES = ["queued", "running", "succeeded", "failed"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export type ReportContext = {
	tenantName: string
	restaurant: {
		name: string
		addressLine: string
		city: string
		state: string
		pinCode: string
		cuisineType: string
		gstNumber: string
		contactPhone: string
	} | null
	requester: { name: string; email: string; role: string }
}

const toRecord = (row: typeof reports.$inferSelect): ReportRecord => ({
	id: row.id,
	tenantId: row.tenantId,
	restaurantId: row.restaurantId,
	reportType: row.reportType as ReportType,
	periodStart: String(row.periodStart),
	periodEnd: String(row.periodEnd),
	format: row.format as ReportFormat,
	artifactPath: row.artifactPath,
	status: row.status as ReportStatus,
	error: row.error,
	createdAt: row.createdAt.toISOString(),
	finishedAt: row.finishedAt ? row.finishedAt.toISOString() : "",
	requestedByUserId: row.requestedByUserId,
})

export const insertReport = async (
	ctx: SessionContext,
	values: {
		reportType: ReportType
		from: string
		to: string
		format: ReportFormat
		restaurantId: string
	},
): Promise<ReportRecord> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.insert(reports)
			.values({
				tenantId: ctx.tenantId,
				restaurantId: values.restaurantId,
				reportType: values.reportType,
				periodStart: values.from,
				periodEnd: values.to,
				format: values.format,
				status: "queued",
				requestedByUserId: ctx.userId,
			})
			.returning()
		const row = rows[0]
		if (!row) throw new Error("insertReport returned no rows")
		return toRecord(row)
	})

export const listReportsForTenant = async (
	ctx: SessionContext,
	limit: number = 50,
): Promise<ReportRecord[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(reports)
			.where(eq(reports.tenantId, ctx.tenantId))
			.orderBy(desc(reports.createdAt))
			.limit(limit)
		return rows.map(toRecord)
	})

export const findReportForTenant = async (
	ctx: SessionContext,
	reportId: string,
): Promise<ReportRecord | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(reports)
			.where(and(eq(reports.id, reportId), eq(reports.tenantId, ctx.tenantId)))
			.limit(1)
		const row = rows[0]
		return row ? toRecord(row) : null
	})

export const updateReportStatus = async (
	ctx: SessionContext,
	reportId: string,
	status: ReportStatus,
	fields: { artifactPath?: string; error?: string },
): Promise<ReportRecord | null> =>
	withTenant(ctx, async (tx) => {
		const update: {
			status: ReportStatus
			artifactPath?: string
			error?: string
			finishedAt?: Date
		} = { status }
		if (fields.artifactPath !== undefined) update.artifactPath = fields.artifactPath
		if (fields.error !== undefined) update.error = fields.error
		if (status === "succeeded" || status === "failed") update.finishedAt = new Date()
		const rows = await tx
			.update(reports)
			.set(update)
			.where(and(eq(reports.id, reportId), eq(reports.tenantId, ctx.tenantId)))
			.returning()
		const row = rows[0]
		return row ? toRecord(row) : null
	})

export const deleteReportArtifact = async (artifactPath: string): Promise<void> => {
	if (artifactPath === "") return
	try {
		const file = Bun.file(artifactPath)
		if (await file.exists()) await file.delete()
	} catch (e) {
		console.error(`[reports] failed to delete artifact ${artifactPath}:`, e)
	}
}

export const listExpiredArtifacts = async (cutoffIso: string): Promise<string[]> => {
	const rows = await sql<{ artifact_path: string }>`
		select artifact_path
		from reports
		where status = 'succeeded'
		  and artifact_path <> ''
		  and finished_at < ${cutoffIso}::timestamptz
		  and artifact_path is not null
	`
	const result = rows as unknown as { artifact_path: string }[]
	return result.map((r) => r.artifact_path)
}

export const loadReportContext = async (
	tenantId: string,
	requesterUserId: string,
): Promise<ReportContext> => {
	const tenantRow = await withSystem(async (tx) => {
		const rows = await tx
			.select({ name: tenants.name })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1)
		return rows[0] ?? null
	})

	const restaurantRow = await withSystem(async (tx) => {
		const rows = await tx
			.select({
				name: restaurants.name,
				addressLine: restaurants.addressLine,
				city: restaurants.city,
				state: restaurants.state,
				pinCode: restaurants.pinCode,
				cuisineType: restaurants.cuisineType,
				gstNumber: restaurants.gstNumber,
				contactPhone: restaurants.contactPhone,
			})
			.from(restaurants)
			.where(eq(restaurants.tenantId, tenantId))
			.limit(1)
		return rows[0] ?? null
	})

	const requesterRow = await withSystem(async (tx) => {
		const rows = await tx
			.select({ name: users.name, email: users.email, role: users.role })
			.from(users)
			.where(eq(users.id, requesterUserId))
			.limit(1)
		return rows[0] ?? null
	})

	return {
		tenantName: tenantRow?.name ?? "",
		restaurant: restaurantRow
			? {
					name: restaurantRow.name,
					addressLine: restaurantRow.addressLine,
					city: restaurantRow.city,
					state: restaurantRow.state,
					pinCode: restaurantRow.pinCode,
					cuisineType: restaurantRow.cuisineType,
					gstNumber: restaurantRow.gstNumber,
					contactPhone: restaurantRow.contactPhone,
				}
			: null,
		requester: {
			name: requesterRow?.name ?? "",
			email: requesterRow?.email ?? "",
			role: requesterRow?.role ?? "",
		},
	}
}
