import { z } from "zod"

export const reportTypeSchema = z.enum(["waste", "recovery", "dishes"])
export type ReportType = z.infer<typeof reportTypeSchema>

export const reportFormatSchema = z.enum(["csv", "pdf", "xlsx"])
export type ReportFormat = z.infer<typeof reportFormatSchema>

export const createReportSchema = z.object({
	reportType: reportTypeSchema,
	from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	format: reportFormatSchema,
})
export type CreateReportInput = z.infer<typeof createReportSchema>

export type ReportRecord = {
	id: string
	tenantId: string
	restaurantId: string
	reportType: ReportType
	periodStart: string
	periodEnd: string
	format: ReportFormat
	artifactPath: string
	status: "queued" | "running" | "succeeded" | "failed"
	error: string
	createdAt: string
	finishedAt: string
	requestedByUserId: string
}
