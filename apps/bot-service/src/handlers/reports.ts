import dayjs from "dayjs"
import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { btn, row } from "../bot/reply"
import { redis } from "../db"
import { empty, esc, heading, italic, lines, truncate } from "../format"
import { callMain, callMainBinary } from "../main-client"
import { encodeAction, mintToken } from "../resolver"
import type { DispatchContext } from "./index"

const REPORT_CHAT_TTL_SECONDS = 60 * 60
const LIST_LIMIT = 10

export type ReportRecord = {
	id: string
	reportType: "waste" | "recovery" | "dishes" | "comprehensive"
	periodStart: string
	periodEnd: string
	format: "csv" | "pdf" | "xlsx"
	status: "queued" | "running" | "succeeded" | "failed"
	artifactPath: string
}

const MIME: Record<string, string> = {
	csv: "text/csv",
	pdf: "application/pdf",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

export const recordReportChat = async (chatId: number, reportId: string): Promise<void> => {
	await redis.set(`bot:report:${reportId}`, String(chatId), "EX", REPORT_CHAT_TTL_SECONDS)
}

export const readReportChat = async (reportId: string): Promise<number> => {
	const raw = await redis.get(`bot:report:${reportId}`)
	if (raw == null) return 0
	const parsed = Number.parseInt(raw, 10)
	return Number.isFinite(parsed) ? parsed : 0
}

const daysInRange = (from: string, to: string): number => {
	const start = dayjs(`${from}T00:00:00Z`)
	const end = dayjs(`${to}T00:00:00Z`)
	if (!start.isValid() || !end.isValid()) return 0
	const diff = end.diff(start, "day") + 1
	return diff > 0 ? diff : 0
}

export const documentFor = async (
	chatId: number,
	report: ReportRecord,
): Promise<Extract<Reply, { kind: "document" }>> => {
	const bytes = await callMainBinary(chatId, `/v1/reports/${report.id}/download`)
	const days = daysInRange(report.periodStart, report.periodEnd)
	const daysLabel = days > 0 ? `${days}-days` : report.periodStart
	return {
		kind: "document",
		filename: `smartplate-${report.reportType}-${daysLabel}-${report.periodStart}.${report.format}`,
		bytes,
		mimeType: MIME[report.format] ?? "application/octet-stream",
		caption: `${report.reportType} report · ${report.periodStart} to ${report.periodEnd} (${days} day${days === 1 ? "" : "s"})`,
	}
}

export const handleReports = {
	async create(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const reportType = entities.reportType ?? "waste"
		const format = entities.format ?? "pdf"
		const from = entities.from ?? dayjs().subtract(7, "day").format("YYYY-MM-DD")
		const to = entities.to ?? dayjs().format("YYYY-MM-DD")
		const data = await callMain<{ jobId: string; status: string }>(chatId, "/v1/reports", {
			method: "POST",
			body: { reportType, from, to, format },
		})
		await recordReportChat(chatId, data.jobId)
		return {
			text: lines([
				`⏳ Building your ${esc(reportType)} report for ${esc(from)} to ${esc(to)}.`,
				italic("I'll send it here the moment it's ready."),
			]),
		}
	},

	async list(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const data = await callMain<{ reports: ReportRecord[] }>(chatId, "/v1/reports")
		if (data.reports.length === 0) {
			return { text: empty("No reports yet.", "Send /report to build one.") }
		}
		const rows: string[] = []
		const keyboard = []
		for (const report of data.reports.slice(0, LIST_LIMIT)) {
			rows.push(
				`${esc(report.reportType)} · ${esc(report.periodStart)} to ${esc(report.periodEnd)} · ${esc(report.format)} · ${esc(report.status)}`,
			)
			if (report.status !== "succeeded") continue
			const token = await mintToken(chatId, { reportId: report.id })
			keyboard.push(
				row([
					btn(
						`Download ${report.reportType} ${report.periodStart}`.slice(0, 60),
						encodeAction("reports.download", token),
					),
				]),
			)
		}
		return {
			text: lines([heading("Your reports", data.reports.length), truncate(rows, LIST_LIMIT, "")]),
			rows: keyboard,
		}
	},

	async download(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const reportId = (entities.reportId ?? "").trim()
		const report = await callMain<ReportRecord>(chatId, `/v1/reports/${reportId}`)
		if (report.status !== "succeeded") {
			return {
				text: lines([
					esc(`That report is ${report.status}.`),
					italic("I'll send it automatically when it's ready."),
				]),
			}
		}
		return documentFor(chatId, report)
	},
}
