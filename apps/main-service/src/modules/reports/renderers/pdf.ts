import { PDFDocument, type PDFFont, StandardFonts } from "pdf-lib"
import type { CsvTable } from "./csv"

const PAGE_WIDTH = 842
const PAGE_HEIGHT = 595
const MARGIN_LEFT = 36
const MARGIN_RIGHT = 36
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 50
const LINE_HEIGHT = 14
const HEADER_LINE_HEIGHT = 18

const truncate = (text: string, max: number): string =>
	text.length <= max ? text : `${text.slice(0, max - 1)}…`

export const renderPdf = async (title: string, table: CsvTable): Promise<Uint8Array> => {
	const doc = await PDFDocument.create()
	const font = await doc.embedFont(StandardFonts.Courier)
	const bold = await doc.embedFont(StandardFonts.CourierBold)

	const colWidths = computeColumnWidths(table.headers, font, bold)
	const usableWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

	let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
	let y = PAGE_HEIGHT - MARGIN_TOP
	page.drawText(title, { x: MARGIN_LEFT, y, size: 14, font: bold })
	y -= HEADER_LINE_HEIGHT * 2

	drawRow(page, table.headers, colWidths, MARGIN_LEFT, y, bold, true)
	y -= HEADER_LINE_HEIGHT
	page.drawLine({
		start: { x: MARGIN_LEFT, y: y + 8 },
		end: { x: MARGIN_LEFT + usableWidth, y: y + 8 },
		thickness: 0.5,
	})

	for (const row of table.rows) {
		if (y < MARGIN_BOTTOM + LINE_HEIGHT) {
			page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
			y = PAGE_HEIGHT - MARGIN_TOP
		}
		y -= LINE_HEIGHT
		drawRow(page, row, colWidths, MARGIN_LEFT, y, font, false)
	}

	return doc.save()
}

const drawRow = (
	page: ReturnType<PDFDocument["addPage"]>,
	cells: string[],
	colWidths: number[],
	startX: number,
	y: number,
	font: PDFFont,
	isHeader: boolean,
): void => {
	let x = startX
	const size = isHeader ? 10 : 9
	for (let i = 0; i < cells.length; i += 1) {
		const maxChars = Math.max(1, Math.floor(colWidths[i] / (size * 0.6)))
		page.drawText(truncate(cells[i], maxChars), { x, y, size, font })
		x += colWidths[i]
	}
}

const computeColumnWidths = (headers: string[], _font: PDFFont, bold: PDFFont): number[] => {
	const usableWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
	const total = headers.reduce((acc, h) => acc + Math.max(1, bold.widthOfTextAtSize(h, 10)), 0)
	if (total <= usableWidth) {
		const scale = usableWidth / total
		return headers.map((h) => Math.max(1, bold.widthOfTextAtSize(h, 10) * scale))
	}
	const perCol = usableWidth / headers.length
	return headers.map((h) => Math.min(perCol, Math.max(1, bold.widthOfTextAtSize(h, 10))))
}
