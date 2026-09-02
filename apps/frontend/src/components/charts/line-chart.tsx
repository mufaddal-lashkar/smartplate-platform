import type { TooltipValueType } from "recharts"
import {
	CartesianGrid,
	Line,
	LineChart as ReLineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts"

export type LineSeries = {
	key: string
	name: string
	color: string
}

export type LineChartProps = {
	title?: string
	data: Record<string, string | number>[]
	series: LineSeries[]
	xKey: string
	yUnit?: string
}

export const LineChart = ({ data, series, xKey, yUnit }: LineChartProps) => {
	const formatValue = (v: number): string => {
		if (yUnit == null || yUnit === "") return v.toString()
		if (yUnit === "kg") return `${v.toFixed(1)} kg`
		if (yUnit === "%") return `${(v * 100).toFixed(1)}%`
		if (yUnit === "rs") return `₹${v.toFixed(0)}`
		return `${v.toFixed(1)} ${yUnit}`
	}
	const yFormatter = formatValue
	const tooltipFormatter = (value: TooltipValueType | undefined): [string, string] => {
		const num = typeof value === "number" ? value : Number(value) || 0
		return [formatValue(num), ""]
	}

	return (
		<div className="h-72 w-full">
			<ResponsiveContainer>
				<ReLineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
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
					{series.map((s) => (
						<Line
							key={s.key}
							type="monotone"
							dataKey={s.key}
							name={s.name}
							stroke={s.color}
							strokeWidth={2}
							dot={{ r: 2 }}
							activeDot={{ r: 4 }}
						/>
					))}
				</ReLineChart>
			</ResponsiveContainer>
		</div>
	)
}
