import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { logger } from "../logger"
import { callMain, callMainBinary } from "../main-client"
import type { DispatchContext } from "./index"

type ReportRecord = {
	id: string
	reportType: "waste" | "recovery" | "dishes"
	periodStart: string
	periodEnd: string
	format: "csv" | "pdf" | "xlsx"
	status: "queued" | "running" | "succeeded" | "failed"
	artifactPath: string
	createdAt: string
	finishedAt: string
}

const todayIso = () => {
	const d = new Date()
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const oneWeekAgoIso = () => {
	const d = new Date()
	d.setDate(d.getDate() - 7)
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const sendAsDocument = async (
	ctx: BotContext,
	reportId: string,
	format: "csv" | "pdf" | "xlsx",
): Promise<Reply> => {
	const url = `/v1/reports/${reportId}/download`
	const bytes = await callMainBinary(requireChatId(ctx), url)
	const mime =
		format === "csv"
			? "text/csv"
			: format === "pdf"
				? "application/pdf"
				: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	const filename = `${reportId}.${format}`
	return {
		kind: "document",
		filename,
		bytes,
		mimeType: mime,
		caption: `Report ${reportId.slice(0, 8)}`,
	}
}

export const handleReports = {
	async create(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const reportType = String(entities.reportType ?? "waste") as "waste" | "recovery" | "dishes"
		const format = String(entities.format ?? "csv") as "csv" | "pdf" | "xlsx"
		const from = String(entities.from ?? oneWeekAgoIso())
		const to = String(entities.to ?? todayIso())
		const data = await callMain<{ jobId: string; reportId: string }>(
			requireChatId(ctx),
			"/v1/reports",
			{
				method: "POST",
				body: { reportType, from, to, format },
			},
		)
		return {
			text: `Report ${data.reportId.slice(0, 8)} queued. I'll send it to you when ready — try /report_download ${data.reportId} in a moment.`,
		}
	},

	async list(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: ReportRecord[] }>(requireChatId(ctx), "/v1/reports")
		if (data.items.length === 0) return { text: "No reports yet." }
		const lines = data.items.map(
			(r) => `• ${r.reportType} ${r.periodStart}..${r.periodEnd} [${r.format}] ${r.status}`,
		)
		return { text: `*Reports*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async download(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.reportId ?? "").trim()
		if (id === "") return { text: "Tell me the report id." }
		try {
			const status = await callMain<ReportRecord>(requireChatId(ctx), `/v1/reports/${id}`)
			if (status.status !== "succeeded") {
				return { text: `Report ${id.slice(0, 8)} is ${status.status}. Try again later.` }
			}
			return await sendAsDocument(ctx, id, status.format)
		} catch (err) {
			logger.warn({ err, reportId: id }, "report download failed")
			return { text: "Couldn't fetch the report. Try again or pick another id." }
		}
	},
}
