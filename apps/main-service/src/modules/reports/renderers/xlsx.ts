import ExcelJS from "exceljs"
import type { CsvTable } from "./csv"

export const renderXlsx = async (sheetName: string, table: CsvTable): Promise<Uint8Array> => {
	const workbook = new ExcelJS.Workbook()
	workbook.creator = "SmartPlate"
	workbook.created = new Date()
	const sheet = workbook.addWorksheet(sheetName)
	sheet.columns = table.headers.map((header, index) => ({
		header,
		key: `c${index}`,
		width: Math.max(header.length + 2, 12),
	}))
	const headerRow = sheet.getRow(1)
	headerRow.font = { bold: true }
	for (const row of table.rows) {
		sheet.addRow(row)
	}
	const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
	return new Uint8Array(buffer)
}
