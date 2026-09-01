import { useState } from "react"
import { cn } from "../../lib/utils"

export type HeatmapCell = {
	row: string
	column: string
	value: number
}

export type HeatmapProps = {
	title?: string
	cells: HeatmapCell[]
	rows: string[]
	columns: string[]
	unit?: string
	maxScale?: number
}

const tileClass = (intensity: number): string => {
	const clamped = Math.max(0, Math.min(1, intensity))
	if (clamped === 0) return "bg-muted text-muted-foreground"
	if (clamped < 0.2) return "bg-chart-1/10 text-foreground"
	if (clamped < 0.4) return "bg-chart-1/25 text-foreground"
	if (clamped < 0.6) return "bg-chart-1/45 text-primary-foreground"
	if (clamped < 0.8) return "bg-chart-1/70 text-primary-foreground"
	return "bg-chart-1 text-primary-foreground"
}

const formatValue = (v: number, unit: string | undefined): string => {
	if (unit === "kg") return v.toFixed(1)
	if (unit === "%") return `${(v * 100).toFixed(1)}%`
	return v.toFixed(2)
}

const findCell = (cells: HeatmapCell[], row: string, column: string): number =>
	cells.find((c) => c.row === row && c.column === column)?.value ?? 0

export const Heatmap = ({ cells, rows, columns, unit, maxScale }: HeatmapProps) => {
	const [view, setView] = useState<"chart" | "table">("chart")
	const max = maxScale ?? Math.max(0, ...cells.map((c) => c.value))
	const intensity = (v: number): number => (max > 0 ? v / max : 0)

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-end">
				<button
					type="button"
					className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
					onClick={() => setView(view === "chart" ? "table" : "chart")}
				>
					{view === "chart" ? "Show as table" : "Show as chart"}
				</button>
			</div>

			{view === "chart" ? (
				<div className="overflow-x-auto">
					<table className="border-separate border-spacing-1" aria-label="Heatmap">
						<thead>
							<tr>
								<th className="text-xs font-medium text-muted-foreground" />
								{columns.map((col) => (
									<th key={col} className="px-2 py-1 text-xs font-medium text-muted-foreground">
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row}>
									<th className="pr-2 text-left text-xs font-medium text-muted-foreground">
										{row}
									</th>
									{columns.map((col) => {
										const v = findCell(cells, row, col)
										return (
											<td
												key={col}
												className={cn(
													"h-9 min-w-12 rounded-md text-center text-xs font-medium tabular",
													tileClass(intensity(v)),
												)}
												aria-label={`${row} ${col}: ${formatValue(v, unit)}`}
											>
												{formatValue(v, unit)}
											</td>
										)
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="overflow-x-auto rounded-md border border-border">
					<table className="w-full text-xs">
						<thead className="bg-muted">
							<tr>
								<th className="px-3 py-2 text-left font-medium text-muted-foreground" />
								{columns.map((col) => (
									<th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground">
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row} className="border-t border-border">
									<th className="px-3 py-2 text-left font-medium">{row}</th>
									{columns.map((col) => {
										const v = findCell(cells, row, col)
										return (
											<td key={col} className="px-3 py-2 tabular">
												{formatValue(v, unit)}
											</td>
										)
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
