import type { TooltipValueType } from "recharts"
import {
	Bar,
	CartesianGrid,
	Cell,
	Legend,
	BarChart as ReBarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts"

export type StackedSegment = {
	key: string
	name: string
	color: string
}

export type StackedBarChartProps = {
	data: Record<string, string | number>[]
	segments: StackedSegment[]
	xKey: string
	yUnit?: string
}

type Row = Record<string, string | number>
type Segment = StackedSegment

const totalOf = (row: Row, segments: Segment[]): number =>
	segments.reduce((sum, seg) => sum + (Number(row[seg.key]) || 0), 0)

const directLabelShare = 0.05

const directLabelSegments = (row: Row, segments: Segment[]): Segment[] => {
	const total = totalOf(row, segments)
	if (total <= 0) return []
	const ranked = [...segments].sort((a, b) => (Number(row[a.key]) || 0) - (Number(row[b.key]) || 0))
	return ranked.filter((seg) => (Number(row[seg.key]) || 0) / total < directLabelShare).slice(0, 2)
}

export const StackedBarChart = ({ data, segments, xKey, yUnit }: StackedBarChartProps) => {
	const formatValue = (v: number): string => {
		if (yUnit === "kg") return `${v.toFixed(1)} kg`
		if (yUnit === "%") return `${(v * 100).toFixed(1)}%`
		return v.toString()
	}
	const yFormatter = formatValue
	const tooltipFormatter = (value: TooltipValueType | undefined): [string, string] => {
		const num = typeof value === "number" ? value : Number(value) || 0
		return [formatValue(num), ""]
	}

	return (
		<div className="space-y-3">
			<div className="h-72 w-full">
				<ResponsiveContainer>
					<ReBarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
						<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
						<XAxis
							dataKey={xKey}
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							stroke="var(--border)"
						/>
						<YAxis
							tickFormatter={yFormatter}
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							stroke="var(--border)"
						/>
						<Tooltip
							formatter={tooltipFormatter}
							contentStyle={{
								background: "var(--popover)",
								border: "1px solid var(--border)",
								borderRadius: 8,
								fontSize: 12,
							}}
						/>
						<Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="square" />
						{segments.map((seg) => (
							<Bar key={seg.key} dataKey={seg.key} name={seg.name} stackId="stack" fill={seg.color}>
								{data.map((row) => {
									const labeled = directLabelSegments(row, segments).some((s) => s.key === seg.key)
									return (
										<Cell
											key={String(row[xKey])}
											fill={seg.color}
											stroke={labeled ? "var(--foreground)" : seg.color}
											strokeWidth={labeled ? 1 : 0}
										/>
									)
								})}
							</Bar>
						))}
					</ReBarChart>
				</ResponsiveContainer>
			</div>
			{data.length > 0 && (
				<div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
					<p className="mb-2 font-medium text-foreground">Direct labels (smallest segments)</p>
					<ul className="space-y-1">
						{data.map((row) => {
							const labels = directLabelSegments(row, segments)
							if (labels.length === 0) return null
							return (
								<li key={String(row[xKey])} className="tabular">
									<span className="font-medium text-foreground">{String(row[xKey])}:</span>{" "}
									{labels
										.map((s) => `${s.name} ${formatValue(Number(row[s.key]) || 0)}`)
										.join(", ")}
								</li>
							)
						})}
					</ul>
				</div>
			)}
		</div>
	)
}
