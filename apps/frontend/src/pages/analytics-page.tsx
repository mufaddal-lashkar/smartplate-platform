import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import {
	BarChart3Icon,
	IndianRupeeIcon,
	LeafIcon,
	LineChartIcon,
	RecycleIcon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { ChartCard } from "../components/charts/chart-card"
import { Heatmap, type HeatmapCell } from "../components/charts/heatmap"
import { HorizontalBarChart } from "../components/charts/horizontal-bar-chart"
import { type Kpi, KpiGrid } from "../components/charts/kpi-grid"
import { LineChart } from "../components/charts/line-chart"
import { SingleTile } from "../components/charts/single-tile"
import { StackedBarChart, type StackedSegment } from "../components/charts/stacked-bar-chart"
import { type DateRange, DateRangePicker } from "../components/date-range-picker"
import { type DishRecovery, PerDishCard } from "../components/per-dish-card"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Skeleton } from "../components/ui/skeleton"
import { ApiClientError, apiGet } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"

type Grain = "day" | "week" | "month"

type WasteBucket = {
	bucket: string
	surplusKg: number
	wasteKg: number
	kgCo2eAvoided: number
	kgCo2eAvoidedMethod: string
}

type RecoveryBucket = {
	bucket: string
	reusedKg: number
	soldKg: number
	donatedKg: number
	totalRecoveredKg: number
	recoveryRate: number
	kgCo2eAvoided: number
	kgCo2eAvoidedMethod: string
}

type Forecast = {
	dishId: string
	dishName: string
	predictedQty: number
	confidence: number
	source: string
}

const initialRange = (): DateRange => {
	const today = dayjs()
	return {
		from: today.subtract(30, "day").format("YYYY-MM-DD"),
		to: today.format("YYYY-MM-DD"),
	}
}

const kg = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const asPercent = (fraction: number): string => `${Math.round(fraction * 100)}%`

const ChartSkeleton = () => (
	<div className="space-y-3">
		<Skeleton className="h-72 w-full" />
		<Skeleton className="h-4 w-40" />
	</div>
)

const LoadFailed = ({ message }: { message: string }) => (
	<Card className="border-serious/40 bg-serious/5">
		<CardHeader>
			<CardTitle className="text-base text-serious">Could not load analytics</CardTitle>
			<CardDescription>{message}</CardDescription>
		</CardHeader>
	</Card>
)

const WasteTab = ({ range, grain }: { range: DateRange; grain: Grain }) => {
	const query = useQuery({
		queryKey: queryKeys.analyticsWaste(range.from, range.to, grain),
		queryFn: () =>
			apiGet<{ series: WasteBucket[] }>(
				`/v1/analytics/waste?from=${range.from}&to=${range.to}&grain=${grain}`,
			),
	})

	if (query.isPending) return <ChartSkeleton />
	if (query.error != null) return <LoadFailed message={query.error.message} />

	const series = query.data.series
	const method = series[0]?.kgCo2eAvoidedMethod ?? "poore-nemecek-2018"
	const totalWaste = series.reduce((sum, row) => sum + row.wasteKg, 0)
	const totalSurplus = series.reduce((sum, row) => sum + row.surplusKg, 0)
	const totalCo2e = series.reduce((sum, row) => sum + row.kgCo2eAvoided, 0)

	const lineData = series.map((row) => ({
		bucket: row.bucket,
		waste: row.wasteKg,
		surplus: row.surplusKg,
	}))

	const topWasted: Record<string, string | number>[] = []
	void totalSurplus

	const kpis: Kpi[] = [
		{
			label: "Total waste",
			value: `${kg.format(totalWaste)} kg`,
			icon: Trash2Icon,
			tone: "serious",
		},
		{ label: "kgCO₂e avoided", value: `${kg.format(totalCo2e)} kg`, icon: LeafIcon, tone: "good" },
	]

	return (
		<div className="space-y-6">
			<KpiGrid items={kpis} columns={2} />
			<ChartCard title="Waste over time" description={`Bucket: ${grain}`} methodologySlug={method}>
				<LineChart
					data={lineData}
					xKey="bucket"
					yUnit="kg"
					series={[
						{ key: "waste", name: "Waste (kg)", color: "var(--chart-2)" },
						{ key: "surplus", name: "Surplus (kg)", color: "var(--chart-1)" },
					]}
				/>
			</ChartCard>
			<ChartCard title="Top wasted dishes" methodologySlug={method}>
				<HorizontalBarChart
					data={topWasted.length > 0 ? topWasted : [{ name: "no data", value: 0 }]}
					categoryKey="name"
					valueKey="value"
					color="var(--chart-2)"
					yUnit="kg"
				/>
			</ChartCard>
		</div>
	)
}

const RecoveryTab = ({ range, grain }: { range: DateRange; grain: Grain }) => {
	const query = useQuery({
		queryKey: queryKeys.analyticsRecovery(range.from, range.to, grain),
		queryFn: () =>
			apiGet<{ series: RecoveryBucket[] }>(
				`/v1/analytics/recovery?from=${range.from}&to=${range.to}&grain=${grain}`,
			),
	})

	if (query.isPending) return <ChartSkeleton />
	if (query.error != null) return <LoadFailed message={query.error.message} />

	const series = query.data.series
	const method = series[0]?.kgCo2eAvoidedMethod ?? "poore-nemecek-2018"
	const totalReused = series.reduce((sum, row) => sum + row.reusedKg, 0)
	const totalSold = series.reduce((sum, row) => sum + row.soldKg, 0)
	const totalDonated = series.reduce((sum, row) => sum + row.donatedKg, 0)
	const totalCo2e = series.reduce((sum, row) => sum + row.kgCo2eAvoided, 0)

	const stackedData = series.map((row) => ({
		bucket: row.bucket,
		reused: row.reusedKg,
		sold: row.soldKg,
		donated: row.donatedKg,
	}))

	const segments: StackedSegment[] = [
		{ key: "reused", name: "Reused", color: "var(--chart-1)" },
		{ key: "sold", name: "Sold", color: "var(--chart-2)" },
		{ key: "donated", name: "Donated", color: "var(--chart-3)" },
	]

	const kpis: Kpi[] = [
		{ label: "Reused", value: `${kg.format(totalReused)} kg`, icon: RecycleIcon, tone: "good" },
		{ label: "Sold", value: `${kg.format(totalSold)} kg`, icon: IndianRupeeIcon, tone: "good" },
		{ label: "Donated", value: `${kg.format(totalDonated)} kg`, icon: LeafIcon, tone: "good" },
	]

	return (
		<div className="space-y-6">
			<KpiGrid items={kpis} />
			<ChartCard
				title="Disposition mix over time"
				description={`Bucket: ${grain} · direct labels shown on segments < 5% share`}
				methodologySlug={method}
			>
				<StackedBarChart data={stackedData} segments={segments} xKey="bucket" yUnit="kg" />
			</ChartCard>
			<SingleTile
				label="Total CO₂e avoided"
				value={`${kg.format(totalCo2e)} kg`}
				icon={LeafIcon}
				tone="good"
				hint={`Method: ${method}`}
			/>
		</div>
	)
}

const DishesTab = ({ range }: { range: DateRange }) => {
	const query = useQuery({
		queryKey: queryKeys.analyticsDishes(range.from, range.to),
		queryFn: () =>
			apiGet<{ dishes: DishRecovery[] }>(`/v1/analytics/dishes?from=${range.from}&to=${range.to}`),
	})

	if (query.isPending) return <ChartSkeleton />
	if (query.error != null) return <LoadFailed message={query.error.message} />

	const dishes = query.data.dishes
	if (dishes.length === 0) {
		return (
			<Card className="border-dashed">
				<CardHeader>
					<CardTitle className="text-base">No dish history in this range</CardTitle>
					<CardDescription>
						Once you record a few days of close-of-day, each dish's recovery rate will land here.
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{dishes.map((dish) => (
					<PerDishCard key={dish.dishId} dish={dish} />
				))}
			</div>
		</div>
	)
}

const ForecastsTab = ({ range }: { range: DateRange }) => {
	const query = useQuery({
		queryKey: queryKeys.analyticsForecasts(range.from, range.to),
		queryFn: () =>
			apiGet<{ forecasts: Forecast[] }>(`/v1/forecasts?from=${range.from}&to=${range.to}`),
	})

	if (query.isPending) return <ChartSkeleton />
	if (query.error != null) return <LoadFailed message={query.error.message} />

	const forecasts = query.data.forecasts
	if (forecasts.length === 0) {
		return (
			<Card className="border-dashed">
				<CardHeader>
					<CardTitle className="text-base">No forecasts yet</CardTitle>
					<CardDescription>
						Forecasts need ~2 weeks of close-of-day history. The model starts producing them
						automatically.
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	const byConfidence = [...forecasts].sort((a, b) => b.confidence - a.confidence)
	const data = byConfidence.map((f) => ({
		name: f.dishName,
		value: f.predictedQty,
		confidence: f.confidence,
	}))

	return (
		<div className="space-y-6">
			<ChartCard title="Forecast by dish" description="Predicted quantity, sorted by confidence">
				<HorizontalBarChart
					data={data}
					categoryKey="name"
					valueKey="value"
					color="var(--chart-1)"
				/>
			</ChartCard>
		</div>
	)
}

const InsightsTab = () => {
	const query = useQuery({
		queryKey: queryKeys.insights(),
		queryFn: () => apiGet<{ score: { absError: number; model: string } }>("/v1/insights"),
		retry: false,
	})

	if (query.isPending) return <ChartSkeleton />

	if (query.error instanceof ApiClientError && query.error.code === "AI_UNAVAILABLE") {
		return (
			<Card className="border-dashed">
				<CardHeader>
					<div className="flex items-center gap-2">
						<SparklesIcon className="size-4 text-muted-foreground" aria-hidden="true" />
						<CardTitle className="text-base">Insights are coming</CardTitle>
					</div>
					<CardDescription>
						The agent compute service that drives personalised reuse forecasts is not yet deployed.
						The dashboard data above uses deterministic math and is fully available.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button asChild variant="outline" size="sm">
						<Link to="/app/analytics">Back to analytics</Link>
					</Button>
				</CardContent>
			</Card>
		)
	}

	if (query.error != null) return <LoadFailed message={query.error.message} />
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Latest insight</CardTitle>
				<CardDescription>
					Prediction model {query.data.score.model} · abs error{" "}
					{asPercent(query.data.score.absError)}
				</CardDescription>
			</CardHeader>
		</Card>
	)
}

type Tab = "waste" | "recovery" | "dishes" | "forecasts" | "insights"

const TABS: { id: Tab; label: string; icon: typeof BarChart3Icon }[] = [
	{ id: "waste", label: "Waste", icon: Trash2Icon },
	{ id: "recovery", label: "Recovery", icon: RecycleIcon },
	{ id: "dishes", label: "Dishes", icon: BarChart3Icon },
	{ id: "forecasts", label: "Forecasts", icon: LineChartIcon },
	{ id: "insights", label: "Insights", icon: SparklesIcon },
]

const toDayHeatmap = (
	rows: { bucket: string; wasteKg: number }[],
): {
	cells: HeatmapCell[]
	rows: string[]
	columns: string[]
} => {
	const dayOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
	const dayIndex = (date: string): number => {
		const d = new Date(date).getUTCDay()
		return d === 0 ? 6 : d - 1
	}
	const hours = ["00", "04", "08", "12", "16", "20"]
	const cells: HeatmapCell[] = []
	const total = new Map<string, number>()
	for (const row of rows) {
		const dayLabel = dayOfWeek[dayIndex(row.bucket)]
		const hour = row.bucket.slice(11, 13) || "12"
		const key = `${dayLabel}|${hour}`
		total.set(key, (total.get(key) ?? 0) + row.wasteKg)
	}
	for (const [key, value] of total) {
		const [row, column] = key.split("|")
		cells.push({ row, column, value })
	}
	return { cells, rows: dayOfWeek, columns: hours }
}

export const AnalyticsPage = () => {
	const [range, setRange] = useState<DateRange>(initialRange)
	const [grain, setGrain] = useState<Grain>("day")
	const [tab, setTab] = useState<Tab>("waste")

	const wasteForHeatmap = useQuery({
		queryKey: queryKeys.analyticsWaste(range.from, range.to, "day"),
		queryFn: () =>
			apiGet<{ series: WasteBucket[] }>(
				`/v1/analytics/waste?from=${range.from}&to=${range.to}&grain=day`,
			),
	})

	const heatmapData = toDayHeatmap(wasteForHeatmap.data?.series ?? [])

	return (
		<section className="w-full">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">Analytics</h1>
				<p className="mt-1 text-muted-foreground">
					Waste, recovery, dish breakdown and forecasts for your selected range.
				</p>
			</header>

			<div className="mt-6 flex flex-wrap items-end justify-between gap-4">
				<DateRangePicker value={range} onChange={setRange} />
				<div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
					{(["day", "week", "month"] as Grain[]).map((g) => (
						<button
							key={g}
							type="button"
							onClick={() => setGrain(g)}
							className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
								grain === g
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{g}
						</button>
					))}
				</div>
			</div>

			<div className="mt-6 flex flex-wrap gap-1 border-b border-border">
				{TABS.map((t) => {
					const Icon = t.icon
					return (
						<button
							key={t.id}
							type="button"
							onClick={() => setTab(t.id)}
							className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
								tab === t.id
									? "border-primary text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							<Icon className="size-4" aria-hidden="true" />
							{t.label}
						</button>
					)
				})}
			</div>

			<div className="mt-6 space-y-6">
				{tab === "waste" && (
					<>
						<WasteTab range={range} grain={grain} />
						<ChartCard title="Waste by day-of-week × hour" methodologySlug="poore-nemecek-2018">
							<Heatmap
								cells={heatmapData.cells}
								rows={heatmapData.rows}
								columns={heatmapData.columns}
								unit="kg"
							/>
						</ChartCard>
					</>
				)}
				{tab === "recovery" && <RecoveryTab range={range} grain={grain} />}
				{tab === "dishes" && <DishesTab range={range} />}
				{tab === "forecasts" && <ForecastsTab range={range} />}
				{tab === "insights" && <InsightsTab />}
			</div>
		</section>
	)
}
