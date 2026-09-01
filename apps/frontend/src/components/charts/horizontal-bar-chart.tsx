import type { TooltipValueType } from "recharts"
import {
	Bar,
	CartesianGrid,
	Cell,
	LabelList,
	BarChart as ReBarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts"

export type HorizontalBarChartProps = {
	data: Record<string, string | number>[]
	categoryKey: string
	valueKey: string
	color: string
	yUnit?: string
}

const formatValue = (v: number, unit: string | undefined): string => {
	if (unit === "kg") return `${v.toFixed(1)} kg`
	if (unit === "%") return `${(v * 100).toFixed(1)}%`
	if (unit === "rs") return `₹${v.toFixed(0)}`
	return v.toFixed(2)
}

export const HorizontalBarChart = ({
	data,
	categoryKey,
	valueKey,
	color,
	yUnit,
}: HorizontalBarChartProps) => {
	const sorted = [...data].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0))
	const formatter = (v: number): string => formatValue(v, yUnit)
	const tooltipFormatter = (value: TooltipValueType | undefined): [string, string] => {
		const num = typeof value === "number" ? value : Number(value) || 0
		return [formatter(num), ""]
	}
	const labelFormatter = (label: number | string | boolean | null | undefined): string => {
		if (typeof label === "number") return formatter(label)
		return String(label ?? "")
	}

	return (
		<div className="h-72 w-full">
			<ResponsiveContainer>
				<ReBarChart
					data={sorted}
					layout="vertical"
					margin={{ top: 10, right: 32, left: 0, bottom: 0 }}
				>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
					<XAxis
						type="number"
						tickFormatter={formatter}
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						stroke="var(--border)"
					/>
					<YAxis
						dataKey={categoryKey}
						type="category"
						width={120}
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
					<Bar dataKey={valueKey} fill={color} radius={[0, 4, 4, 0]}>
						{sorted.map((row) => (
							<Cell key={String(row[categoryKey])} fill={color} />
						))}
						<LabelList
							dataKey={valueKey}
							position="right"
							formatter={labelFormatter}
							style={{ fontSize: 11, fill: "var(--foreground)" }}
						/>
					</Bar>
				</ReBarChart>
			</ResponsiveContainer>
		</div>
	)
}
