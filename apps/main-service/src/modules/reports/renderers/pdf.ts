import { type Color, PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib"
import type { CsvTable } from "./csv"

const PAGE_WIDTH = 842
const PAGE_HEIGHT = 595
const MARGIN_LEFT = 40
const MARGIN_RIGHT = 40
const MARGIN_TOP = 72
const MARGIN_BOTTOM = 64
const CONTENT_TOP = PAGE_HEIGHT - MARGIN_TOP
const CONTENT_BOTTOM = MARGIN_BOTTOM + 16
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

const c = (hex: number): Color =>
	rgb(((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255)

const COLOR_PRIMARY = c(0x0b7a55)
const COLOR_PRIMARY_DARK = c(0x075e45)
const COLOR_FOREGROUND = c(0x0c1512)
const COLOR_MUTED = c(0x5b6b64)
const COLOR_BORDER = c(0xe3eae7)
const COLOR_SURFACE = c(0xf4f7f6)
const COLOR_WHITE = c(0xffffff)
const COLOR_GOOD = c(0x0f9668)
const COLOR_WARNING = c(0xb8860b)
const COLOR_CRITICAL = c(0xc2372f)
const COLOR_CHART_GREEN = c(0x1baf7a)
const COLOR_CHART_ORANGE = c(0xeb6834)
const COLOR_TICK_GRID = c(0xe3eae7)

export type ReportType = "waste" | "recovery" | "dishes"

export type ReportOrg = {
	tenantName: string
	restaurantName: string
	addressLine: string
	city: string
	state: string
	pinCode: string
	cuisineType: string
	gstNumber: string
	contactPhone: string
}

export type ReportRequester = {
	name: string
	email: string
	role: string
}

export type ReportKpi = {
	label: string
	value: string
	hint: string
	emphasis: "primary" | "good" | "warning" | "critical"
}

export type ReportChartPoint = {
	label: string
	primary: number
	secondary: number
}

export type ReportDocument = {
	reportId: string
	reportType: ReportType
	reportTitle: string
	periodStart: string
	periodEnd: string
	generatedAt: string
	org: ReportOrg
	requester: ReportRequester
	kpis: ReportKpi[]
	chart: {
		title: string
		primaryLabel: string
		secondaryLabel: string
		points: ReportChartPoint[]
	}
	table: CsvTable
}

const truncate = (text: string, max: number): string =>
	text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}...`

const emphasisColor = (kind: ReportKpi["emphasis"]): Color => {
	if (kind === "good") return COLOR_GOOD
	if (kind === "warning") return COLOR_WARNING
	if (kind === "critical") return COLOR_CRITICAL
	return COLOR_PRIMARY
}

const formatPeriod = (from: string, to: string): string => {
	if (from === to) return from
	return `${from} - ${to}`
}

const reportSubtitle = (type: ReportType): string => {
	if (type === "waste") return "Surplus and waste performance"
	if (type === "recovery") return "Recovery channels and avoided emissions"
	return "Per-dish recovery breakdown"
}

const reportAudience = (role: string): string => {
	if (role === "owner") return "Owner"
	if (role === "staff") return "Staff"
	if (role === "super_admin") return "Super admin"
	return role
}

export const renderPdf = async (title: string, table: CsvTable): Promise<Uint8Array> => {
	const emptyDoc: ReportDocument = {
		reportId: "",
		reportType: "waste",
		reportTitle: title,
		periodStart: "",
		periodEnd: "",
		generatedAt: new Date().toISOString(),
		org: {
			tenantName: "",
			restaurantName: title,
			addressLine: "",
			city: "",
			state: "",
			pinCode: "",
			cuisineType: "",
			gstNumber: "",
			contactPhone: "",
		},
		requester: { name: "", email: "", role: "" },
		kpis: [],
		chart: { title: "", primaryLabel: "", secondaryLabel: "", points: [] },
		table,
	}
	return renderReportPdf(emptyDoc)
}

export const renderReportPdf = async (doc: ReportDocument): Promise<Uint8Array> => {
	const pdf = await PDFDocument.create()
	pdf.setTitle(`${doc.reportTitle} - ${doc.org.restaurantName}`)
	pdf.setAuthor("SmartPlate")
	pdf.setSubject(`${doc.reportType} report for ${doc.org.restaurantName}`)
	pdf.setCreator("SmartPlate Reports")
	pdf.setProducer("SmartPlate")
	pdf.setCreationDate(new Date(doc.generatedAt))

	const fontRegular = await pdf.embedFont(StandardFonts.Helvetica)
	const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)
	const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique)
	const fontMono = await pdf.embedFont(StandardFonts.Courier)

	const pages: PDFPage[] = []
	const addPage = (): PDFPage => {
		const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
		pages.push(page)
		return page
	}

	const cover = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
	pages.push(cover)
	drawCover(cover, doc, fontRegular, fontBold, fontItalic)

	const summary = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
	pages.push(summary)
	let summaryY = CONTENT_TOP
	summaryY = drawSummaryHeader(summary, doc, fontRegular, fontBold, summaryY)
	summaryY = drawKpiGrid(summary, doc, fontRegular, fontBold, summaryY)
	summaryY = drawChart(summary, doc, fontRegular, fontBold, summaryY)

	drawTable(doc, fontRegular, fontBold, fontMono, addPage)

	const total = pages.length
	for (let i = 0; i < total; i += 1) {
		const page = pages[i]
		if (page == null) continue
		drawChrome(page, doc, fontRegular, fontBold, i + 1, total)
	}

	return pdf.save()
}

type PDFPage = ReturnType<PDFDocument["addPage"]>

const drawCover = (
	page: PDFPage,
	doc: ReportDocument,
	font: PDFFont,
	bold: PDFFont,
	italic: PDFFont,
): void => {
	page.drawRectangle({
		x: 0,
		y: PAGE_HEIGHT - 14,
		width: PAGE_WIDTH,
		height: 14,
		color: COLOR_PRIMARY,
	})
	page.drawRectangle({
		x: 0,
		y: 0,
		width: PAGE_WIDTH,
		height: 10,
		color: COLOR_PRIMARY_DARK,
	})

	drawWordmark(page, font, bold, MARGIN_LEFT, PAGE_HEIGHT - 64)

	page.drawText("Report", {
		x: MARGIN_LEFT,
		y: PAGE_HEIGHT - 130,
		size: 11,
		font: bold,
		color: COLOR_PRIMARY,
	})

	page.drawText(doc.reportTitle, {
		x: MARGIN_LEFT,
		y: PAGE_HEIGHT - 162,
		size: 30,
		font: bold,
		color: COLOR_FOREGROUND,
	})

	page.drawText(reportSubtitle(doc.reportType), {
		x: MARGIN_LEFT,
		y: PAGE_HEIGHT - 188,
		size: 13,
		font: italic,
		color: COLOR_MUTED,
	})

	const orgStartY = PAGE_HEIGHT - 230
	page.drawLine({
		start: { x: MARGIN_LEFT, y: orgStartY + 8 },
		end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: orgStartY + 8 },
		thickness: 0.6,
		color: COLOR_BORDER,
	})
	page.drawText("Organisation", {
		x: MARGIN_LEFT,
		y: orgStartY - 8,
		size: 9,
		font: bold,
		color: COLOR_PRIMARY,
	})

	let y = orgStartY - 28
	page.drawText(doc.org.restaurantName, {
		x: MARGIN_LEFT,
		y,
		size: 16,
		font: bold,
		color: COLOR_FOREGROUND,
	})
	y -= 18

	const lines: string[] = []
	if (doc.org.addressLine !== "") lines.push(doc.org.addressLine)
	const cityLine = [doc.org.city, doc.org.state, doc.org.pinCode]
		.filter((part) => part !== "")
		.join(", ")
	if (cityLine !== "") lines.push(cityLine)
	if (doc.org.cuisineType !== "") lines.push(`Cuisine: ${doc.org.cuisineType}`)
	if (doc.org.gstNumber !== "") lines.push(`GSTIN: ${doc.org.gstNumber}`)
	if (doc.org.contactPhone !== "") lines.push(`Contact: ${doc.org.contactPhone}`)

	for (const line of lines) {
		page.drawText(line, { x: MARGIN_LEFT, y, size: 10.5, font, color: COLOR_FOREGROUND })
		y -= 14
	}

	const metaStartY = y - 28
	page.drawLine({
		start: { x: MARGIN_LEFT, y: metaStartY + 8 },
		end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: metaStartY + 8 },
		thickness: 0.6,
		color: COLOR_BORDER,
	})
	page.drawText("Report metadata", {
		x: MARGIN_LEFT,
		y: metaStartY - 8,
		size: 9,
		font: bold,
		color: COLOR_PRIMARY,
	})

	const colX = MARGIN_LEFT
	const colGap = (CONTENT_WIDTH - 8) / 2
	let rowY = metaStartY - 28
	const leftMeta: { label: string; value: string }[] = [
		{ label: "Report type", value: doc.reportType },
		{ label: "Period", value: formatPeriod(doc.periodStart, doc.periodEnd) },
	]
	const rightMeta: { label: string; value: string }[] = [
		{
			label: "Generated",
			value: `${new Date(doc.generatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC`,
		},
		{ label: "Report ID", value: doc.reportId === "" ? "-" : doc.reportId },
	]
	if (doc.requester.name !== "" || doc.requester.email !== "") {
		rightMeta.push({
			label: "Requested by",
			value:
				doc.requester.name !== ""
					? `${doc.requester.name} (${reportAudience(doc.requester.role)})`
					: doc.requester.email,
		})
	}

	for (let i = 0; i < Math.max(leftMeta.length, rightMeta.length); i += 1) {
		const left = leftMeta[i]
		const right = rightMeta[i]
		if (left) {
			page.drawText(left.label.toUpperCase(), {
				x: colX,
				y: rowY,
				size: 8,
				font: bold,
				color: COLOR_MUTED,
			})
			page.drawText(truncate(left.value, 48), {
				x: colX,
				y: rowY - 12,
				size: 11,
				font,
				color: COLOR_FOREGROUND,
			})
		}
		if (right) {
			page.drawText(right.label.toUpperCase(), {
				x: colX + colGap,
				y: rowY,
				size: 8,
				font: bold,
				color: COLOR_MUTED,
			})
			page.drawText(truncate(right.value, 48), {
				x: colX + colGap,
				y: rowY - 12,
				size: 11,
				font,
				color: COLOR_FOREGROUND,
			})
		}
		rowY -= 32
	}

	const stampY = 132
	page.drawRectangle({
		x: MARGIN_LEFT,
		y: stampY - 28,
		width: CONTENT_WIDTH,
		height: 56,
		color: COLOR_SURFACE,
		borderColor: COLOR_BORDER,
		borderWidth: 0.6,
	})
	page.drawText("Confidential", {
		x: MARGIN_LEFT + 16,
		y: stampY - 4,
		size: 11,
		font: bold,
		color: COLOR_PRIMARY,
	})
	page.drawText(
		"This document is generated for internal use of the named organisation only. Do not redistribute.",
		{ x: MARGIN_LEFT + 16, y: stampY - 20, size: 9, font, color: COLOR_MUTED },
	)
}

const drawWordmark = (page: PDFPage, font: PDFFont, bold: PDFFont, x: number, y: number): void => {
	const radius = 10
	page.drawCircle({ x: x + radius, y: y + 4, size: radius, color: COLOR_PRIMARY })
	page.drawText("S", {
		x: x + 5.5,
		y: y - 1,
		size: 13,
		font: bold,
		color: COLOR_WHITE,
	})
	page.drawText("SmartPlate", {
		x: x + radius * 2 + 6,
		y: y,
		size: 16,
		font: bold,
		color: COLOR_PRIMARY_DARK,
	})
	page.drawText(" · Surplus to impact", {
		x: x + radius * 2 + 6 + bold.widthOfTextAtSize("SmartPlate", 16),
		y: y,
		size: 9,
		font,
		color: COLOR_MUTED,
	})
}

const drawChrome = (
	page: PDFPage,
	doc: ReportDocument,
	font: PDFFont,
	bold: PDFFont,
	pageNumber: number,
	totalPages: number,
): void => {
	if (pageNumber === 1) {
		return
	}

	page.drawLine({
		start: { x: MARGIN_LEFT, y: PAGE_HEIGHT - MARGIN_TOP + 16 },
		end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: PAGE_HEIGHT - MARGIN_TOP + 16 },
		thickness: 0.4,
		color: COLOR_BORDER,
	})
	page.drawText(`${doc.org.restaurantName} · ${doc.reportTitle}`, {
		x: MARGIN_LEFT,
		y: PAGE_HEIGHT - MARGIN_TOP + 28,
		size: 9,
		font: bold,
		color: COLOR_PRIMARY,
	})
	page.drawText(`${formatPeriod(doc.periodStart, doc.periodEnd)}`, {
		x:
			PAGE_WIDTH -
			MARGIN_RIGHT -
			font.widthOfTextAtSize(formatPeriod(doc.periodStart, doc.periodEnd), 9),
		y: PAGE_HEIGHT - MARGIN_TOP + 28,
		size: 9,
		font,
		color: COLOR_MUTED,
	})

	page.drawLine({
		start: { x: MARGIN_LEFT, y: MARGIN_BOTTOM - 14 },
		end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: MARGIN_BOTTOM - 14 },
		thickness: 0.4,
		color: COLOR_BORDER,
	})
	page.drawText("SmartPlate", {
		x: MARGIN_LEFT,
		y: MARGIN_BOTTOM - 28,
		size: 8.5,
		font: bold,
		color: COLOR_PRIMARY,
	})
	page.drawText(`Generated ${doc.generatedAt.replace("T", " ").slice(0, 19)} UTC`, {
		x: MARGIN_LEFT + bold.widthOfTextAtSize("SmartPlate", 8.5) + 8,
		y: MARGIN_BOTTOM - 28,
		size: 8.5,
		font,
		color: COLOR_MUTED,
	})
	const pageLabel = totalPages > 0 ? `Page ${pageNumber} of ${totalPages}` : `Page ${pageNumber}`
	page.drawText(pageLabel, {
		x: PAGE_WIDTH - MARGIN_RIGHT - font.widthOfTextAtSize(pageLabel, 8.5),
		y: MARGIN_BOTTOM - 28,
		size: 8.5,
		font,
		color: COLOR_MUTED,
	})
	page.drawText("Confidential · internal use only", {
		x: MARGIN_LEFT,
		y: MARGIN_BOTTOM - 42,
		size: 8,
		font,
		color: COLOR_MUTED,
	})
}

const drawSummaryHeader = (
	page: PDFPage,
	doc: ReportDocument,
	font: PDFFont,
	bold: PDFFont,
	y: number,
): number => {
	page.drawText("Executive summary", {
		x: MARGIN_LEFT,
		y,
		size: 18,
		font: bold,
		color: COLOR_FOREGROUND,
	})
	y -= 22
	page.drawText(
		`Key signals for ${doc.org.restaurantName} between ${formatPeriod(doc.periodStart, doc.periodEnd)}.`,
		{ x: MARGIN_LEFT, y, size: 10.5, font, color: COLOR_MUTED },
	)
	return y - 22
}

const drawKpiGrid = (
	page: PDFPage,
	doc: ReportDocument,
	font: PDFFont,
	bold: PDFFont,
	y: number,
): number => {
	const kpis = doc.kpis
	if (kpis.length === 0) return y
	const cols = 3
	const gap = 12
	const cellW = (CONTENT_WIDTH - gap * (cols - 1)) / cols
	const cellH = 70

	for (let i = 0; i < kpis.length; i += 1) {
		const kpi = kpis[i]
		if (kpi == null) continue
		const col = i % cols
		const row = Math.floor(i / cols)
		const x = MARGIN_LEFT + col * (cellW + gap)
		const cy = y - row * (cellH + gap) - cellH
		drawKpiCell(page, kpi, x, cy, cellW, cellH, font, bold)
	}

	const rows = Math.ceil(kpis.length / cols)
	return y - rows * (cellH + gap) + gap
}

const drawKpiCell = (
	page: PDFPage,
	kpi: ReportKpi,
	x: number,
	y: number,
	w: number,
	h: number,
	font: PDFFont,
	bold: PDFFont,
): void => {
	page.drawRectangle({
		x,
		y,
		width: w,
		height: h,
		color: COLOR_WHITE,
		borderColor: COLOR_BORDER,
		borderWidth: 0.6,
	})
	page.drawRectangle({
		x,
		y: y + h - 3,
		width: w,
		height: 3,
		color: emphasisColor(kpi.emphasis),
	})
	page.drawText(kpi.label.toUpperCase(), {
		x: x + 12,
		y: y + h - 20,
		size: 8,
		font: bold,
		color: COLOR_MUTED,
	})
	page.drawText(truncate(kpi.value, 14), {
		x: x + 12,
		y: y + h - 44,
		size: 18,
		font: bold,
		color: COLOR_FOREGROUND,
	})
	page.drawText(truncate(kpi.hint, 48), {
		x: x + 12,
		y: y + 12,
		size: 9,
		font,
		color: COLOR_MUTED,
	})
}

const drawChart = (
	page: PDFPage,
	doc: ReportDocument,
	font: PDFFont,
	bold: PDFFont,
	y: number,
): number => {
	const chart = doc.chart
	if (chart.points.length === 0) return y

	const chartH = 168
	const chartTop = y
	const chartBottom = chartTop - chartH
	page.drawText(chart.title, {
		x: MARGIN_LEFT,
		y: chartTop - 4,
		size: 13,
		font: bold,
		color: COLOR_FOREGROUND,
	})
	drawLegend(page, chart, font, MARGIN_LEFT, chartTop - 22)

	const plotX = MARGIN_LEFT + 40
	const plotY = chartBottom + 18
	const plotW = CONTENT_WIDTH - 48
	const plotH = chartH - 56

	page.drawRectangle({
		x: plotX,
		y: plotY,
		width: plotW,
		height: plotH,
		color: COLOR_SURFACE,
		borderColor: COLOR_BORDER,
		borderWidth: 0.4,
	})

	const maxVal = Math.max(1, ...chart.points.map((p) => Math.max(p.primary, p.secondary)))
	const niceMax = niceCeiling(maxVal)
	const ticks = 4
	for (let i = 0; i <= ticks; i += 1) {
		const ty = plotY + (plotH * i) / ticks
		page.drawLine({
			start: { x: plotX, y: ty },
			end: { x: plotX + plotW, y: ty },
			thickness: 0.3,
			color: i === 0 ? COLOR_BORDER : COLOR_TICK_GRID,
		})
		const tickVal = niceMax - (niceMax * i) / ticks
		page.drawText(formatTick(tickVal), {
			x: MARGIN_LEFT,
			y: ty - 3,
			size: 7.5,
			font,
			color: COLOR_MUTED,
		})
	}

	const pointCount = chart.points.length
	if (pointCount === 1) {
		const only = chart.points[0]
		if (only) {
			const bw = (plotW - 24) / 2
			drawBar(page, plotX + 12, plotY, bw, plotH, only.primary, niceMax, COLOR_CHART_GREEN)
			drawBar(
				page,
				plotX + 12 + bw + 4,
				plotY,
				bw,
				plotH,
				only.secondary,
				niceMax,
				COLOR_CHART_ORANGE,
			)
			page.drawText(truncate(only.label, 18), {
				x: plotX + plotW / 2 - 30,
				y: plotY - 12,
				size: 8,
				font,
				color: COLOR_MUTED,
			})
		}
	} else {
		const groupGap = 8
		const groupW = (plotW - 16 - groupGap * (pointCount - 1)) / pointCount
		const barW = (groupW - 4) / 2
		for (let i = 0; i < pointCount; i += 1) {
			const point = chart.points[i]
			if (point == null) continue
			const gx = plotX + 8 + i * (groupW + groupGap)
			drawBar(page, gx, plotY, barW, plotH, point.primary, niceMax, COLOR_CHART_GREEN)
			drawBar(page, gx + barW + 4, plotY, barW, plotH, point.secondary, niceMax, COLOR_CHART_ORANGE)
			page.drawText(truncate(point.label, 10), {
				x: gx,
				y: plotY - 12,
				size: 7.5,
				font,
				color: COLOR_MUTED,
			})
		}
	}

	return chartBottom - 18
}

const drawLegend = (
	page: PDFPage,
	chart: ReportDocument["chart"],
	font: PDFFont,
	x: number,
	y: number,
): void => {
	let cx = x
	const drawItem = (label: string, color: Color): void => {
		page.drawRectangle({ x: cx, y, width: 10, height: 6, color })
		page.drawText(label, { x: cx + 14, y: y - 1, size: 8.5, font, color: COLOR_FOREGROUND })
		cx += 14 + font.widthOfTextAtSize(label, 8.5) + 16
	}
	if (chart.primaryLabel !== "") drawItem(chart.primaryLabel, COLOR_CHART_GREEN)
	if (chart.secondaryLabel !== "") drawItem(chart.secondaryLabel, COLOR_CHART_ORANGE)
}

const drawBar = (
	page: PDFPage,
	x: number,
	baseY: number,
	w: number,
	h: number,
	value: number,
	max: number,
	color: Color,
): void => {
	const ratio = Math.max(0, Math.min(1, value / max))
	const barH = h * ratio
	if (barH <= 0) return
	page.drawRectangle({
		x,
		y: baseY,
		width: w,
		height: barH,
		color,
	})
}

const niceCeiling = (value: number): number => {
	if (value <= 0) return 1
	const magnitude = 10 ** Math.floor(Math.log10(value))
	const norm = value / magnitude
	let nice: number
	if (norm <= 1) nice = 1
	else if (norm <= 2) nice = 2
	else if (norm <= 5) nice = 5
	else nice = 10
	return nice * magnitude
}

const formatTick = (value: number): string => {
	if (value === 0) return "0"
	if (value >= 1000) return `${Math.round(value / 100) / 10}k`
	if (value >= 100) return value.toFixed(0)
	return value.toFixed(1)
}

const drawTable = (
	doc: ReportDocument,
	font: PDFFont,
	bold: PDFFont,
	mono: PDFFont,
	addPage: () => PDFPage,
): PDFPage[] => {
	const pages: PDFPage[] = []
	const colWidths = computeColumnWidths(doc.table.headers, bold)
	const headerSize = 9.5
	const rowSize = 9
	const cellPadX = 6
	const cellPadY = 4
	const rowHeight = rowSize + cellPadY * 2

	let page = addPage()
	pages.push(page)
	let y = CONTENT_TOP

	page.drawText("Detailed table", {
		x: MARGIN_LEFT,
		y,
		size: 16,
		font: bold,
		color: COLOR_FOREGROUND,
	})
	y -= 22
	page.drawText(doc.table.title, { x: MARGIN_LEFT, y, size: 10.5, font, color: COLOR_MUTED })
	y -= 18

	const drawHeader = (): void => {
		page.drawRectangle({
			x: MARGIN_LEFT,
			y: y - rowHeight,
			width: CONTENT_WIDTH,
			height: rowHeight,
			color: COLOR_PRIMARY,
		})
		let hx = MARGIN_LEFT + cellPadX
		for (let i = 0; i < doc.table.headers.length; i += 1) {
			const header = doc.table.headers[i]
			const w = colWidths[i] ?? 0
			page.drawText(truncate(header, Math.max(2, Math.floor(w / (headerSize * 0.55)))), {
				x: hx,
				y: y - cellPadY - rowSize,
				size: headerSize,
				font: bold,
				color: COLOR_WHITE,
			})
			hx += w
		}
		y -= rowHeight
	}
	drawHeader()

	for (let r = 0; r < doc.table.rows.length; r += 1) {
		const row = doc.table.rows[r]
		if (row == null) continue
		if (y - rowHeight < CONTENT_BOTTOM) {
			page = addPage()
			pages.push(page)
			y = CONTENT_TOP
			page.drawText("Detailed table (continued)", {
				x: MARGIN_LEFT,
				y,
				size: 12,
				font: bold,
				color: COLOR_FOREGROUND,
			})
			y -= 18
			drawHeader()
		}
		const zebra = r % 2 === 1
		if (zebra) {
			page.drawRectangle({
				x: MARGIN_LEFT,
				y: y - rowHeight,
				width: CONTENT_WIDTH,
				height: rowHeight,
				color: COLOR_SURFACE,
			})
		}
		page.drawLine({
			start: { x: MARGIN_LEFT, y: y - rowHeight },
			end: { x: MARGIN_LEFT + CONTENT_WIDTH, y: y - rowHeight },
			thickness: 0.3,
			color: COLOR_BORDER,
		})
		let cx = MARGIN_LEFT + cellPadX
		for (let i = 0; i < row.length; i += 1) {
			const cell = row[i]
			if (cell == null) continue
			const w = colWidths[i] ?? 0
			const isNumeric = /^-?[\d.,]+$/.test(cell)
			const cellFont = isNumeric ? mono : font
			const maxChars = Math.max(2, Math.floor(w / (rowSize * 0.55)))
			page.drawText(truncate(cell, maxChars), {
				x: cx,
				y: y - cellPadY - rowSize,
				size: rowSize,
				font: cellFont,
				color: COLOR_FOREGROUND,
			})
			cx += w
		}
		y -= rowHeight
	}
	page.drawLine({
		start: { x: MARGIN_LEFT, y },
		end: { x: MARGIN_LEFT + CONTENT_WIDTH, y },
		thickness: 0.4,
		color: COLOR_BORDER,
	})
	return pages
}

const computeColumnWidths = (headers: string[], bold: PDFFont): number[] => {
	const total = headers.reduce((acc, h) => acc + Math.max(1, bold.widthOfTextAtSize(h, 10)), 0)
	if (total <= CONTENT_WIDTH) {
		const scale = CONTENT_WIDTH / total
		return headers.map((h) => Math.max(1, bold.widthOfTextAtSize(h, 10) * scale))
	}
	const perCol = CONTENT_WIDTH / headers.length
	return headers.map((h) => Math.min(perCol, Math.max(1, bold.widthOfTextAtSize(h, 10) * 1.1)))
}
