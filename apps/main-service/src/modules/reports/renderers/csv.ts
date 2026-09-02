export type CsvTable = {
	headers: string[]
	rows: string[][]
}

const escapeCell = (cell: string): string => {
	if (cell.includes(",") || cell.includes("\n") || cell.includes('"')) {
		return `"${cell.replace(/"/g, '""')}"`
	}
	return cell
}

export const renderCsv = (table: CsvTable): Uint8Array => {
	const lines: string[] = []
	lines.push(table.headers.map(escapeCell).join(","))
	for (const row of table.rows) {
		lines.push(row.map(escapeCell).join(","))
	}
	const csv = `${lines.join("\n")}\n`
	return new TextEncoder().encode(csv)
}
