import { useQuery } from "@tanstack/react-query"
import {
	IndianRupeeIcon,
	InfoIcon,
	LeafIcon,
	type LucideIcon,
	RecycleIcon,
	ScaleIcon,
	ShieldCheckIcon,
	Trash2Icon,
	TriangleAlertIcon,
} from "lucide-react"
import { Link } from "react-router"
import { useSession } from "../auth/use-session"
import { ActivityFeed } from "../components/activity-feed"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Skeleton } from "../components/ui/skeleton"
import { apiGet } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { cn } from "../lib/utils"

type Dashboard = {
	surplusRate: number
	wasteRate: number
	recoveryRate: number
	valueRecovered: number
	lossAvoided: number
	kgDiverted: number
	unconvertibleQty: number
	pendingLeftovers: number
	openListings: number
}

type RateTile = {
	label: string
	value: number
	icon: LucideIcon
	tone: string
	direction: string
	hint: string
}

const rupees = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0,
})

const kilograms = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 })

const quantities = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 })

const asPercent = (fraction: number): string => `${Math.round(fraction * 100)}%`

const plural = (count: number, one: string, many: string): string =>
	`${count} ${count === 1 ? one : many}`

const rateTiles = (data: Dashboard): RateTile[] => [
	{
		label: "Recovery rate",
		value: data.recoveryRate,
		icon: RecycleIcon,
		tone: "text-good",
		direction: "Higher is better",
		hint: "Share of leftovers reused, sold or donated",
	},
	{
		label: "Surplus rate",
		value: data.surplusRate,
		icon: ScaleIcon,
		tone: "text-warning",
		direction: "Lower is better",
		hint: "Share of everything prepared that was left over",
	},
	{
		label: "Waste rate",
		value: data.wasteRate,
		icon: Trash2Icon,
		tone: "text-critical",
		direction: "Lower is better",
		hint: "Share of everything prepared that reached the bin",
	},
]

const attentionText = (data: Dashboard): string => {
	const parts: string[] = []
	if (data.pendingLeftovers > 0) {
		parts.push(`${plural(data.pendingLeftovers, "leftover", "leftovers")} waiting on a decision`)
	}
	if (data.openListings > 0) {
		parts.push(`${plural(data.openListings, "listing", "listings")} still open`)
	}
	return parts.join(" · ")
}

const hasHistory = (data: Dashboard): boolean =>
	data.recoveryRate > 0 ||
	data.surplusRate > 0 ||
	data.wasteRate > 0 ||
	data.valueRecovered > 0 ||
	data.lossAvoided > 0 ||
	data.kgDiverted > 0 ||
	data.unconvertibleQty > 0 ||
	data.pendingLeftovers > 0 ||
	data.openListings > 0

const MetricsSkeleton = () => (
	<div className="space-y-4">
		<div className="grid gap-4 sm:grid-cols-3">
			<Skeleton className="h-36 w-full" />
			<Skeleton className="h-36 w-full" />
			<Skeleton className="h-36 w-full" />
		</div>
		<div className="grid gap-4 sm:grid-cols-3">
			<Skeleton className="h-32 w-full" />
			<Skeleton className="h-32 w-full" />
			<Skeleton className="h-32 w-full" />
		</div>
	</div>
)

const AttentionStrip = ({ data }: { data: Dashboard }) => (
	<div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
		<TriangleAlertIcon className="size-4 shrink-0 text-serious" aria-hidden="true" />
		<p className="text-sm font-medium text-serious">{attentionText(data)}</p>
		<div className="ml-auto flex flex-wrap gap-2">
			{data.pendingLeftovers > 0 && (
				<Button asChild size="sm" variant="outline">
					<Link to="/app/leftovers">Close the day</Link>
				</Button>
			)}
			{data.openListings > 0 && (
				<Button asChild size="sm" variant="outline">
					<Link to="/app/listings">Review listings</Link>
				</Button>
			)}
		</div>
	</div>
)

const RateCard = ({ tile }: { tile: RateTile }) => (
	<Card>
		<CardHeader>
			<div className="flex items-center gap-2">
				<tile.icon className={cn("size-4", tile.tone)} aria-hidden="true" />
				<CardDescription>{tile.label}</CardDescription>
			</div>
			<CardTitle className={cn("font-display text-3xl tabular", tile.tone)}>
				{asPercent(tile.value)}
			</CardTitle>
		</CardHeader>
		<CardContent>
			<p className="text-xs font-medium">{tile.direction}</p>
			<p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
		</CardContent>
	</Card>
)

const Metrics = ({ data }: { data: Dashboard }) => (
	<div className="space-y-4">
		{attentionText(data) !== "" && <AttentionStrip data={data} />}

		<div className="grid gap-4 sm:grid-cols-3">
			{rateTiles(data).map((tile) => (
				<RateCard key={tile.label} tile={tile} />
			))}
		</div>

		<div className="grid gap-4 sm:grid-cols-3">
			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<IndianRupeeIcon className="size-4 text-primary" aria-hidden="true" />
						<CardDescription>Value recovered</CardDescription>
					</div>
					<CardTitle className="font-display text-2xl tabular">
						{rupees.format(data.valueRecovered)}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-xs text-muted-foreground">
						Surplus sales and reuse in the kitchen. Donated food counts as impact below, never as
						revenue.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<ShieldCheckIcon className="size-4 text-good" aria-hidden="true" />
						<CardDescription>Loss avoided</CardDescription>
					</div>
					<CardTitle className="font-display text-2xl tabular">
						{rupees.format(data.lossAvoided)}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-xs text-muted-foreground">
						Food cost that would have been written off had none of it been recovered.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<div className="flex items-center gap-2">
						<LeafIcon className="size-4 text-good" aria-hidden="true" />
						<CardDescription>Food diverted</CardDescription>
					</div>
					<CardTitle className="font-display text-2xl tabular">
						{kilograms.format(data.kgDiverted)} kg
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-xs text-muted-foreground">
						Reused, sold and donated together — every kilogram kept out of the bin.
					</p>
				</CardContent>
			</Card>
		</div>

		{data.unconvertibleQty > 0 && (
			<p className="flex items-start gap-2 text-xs text-muted-foreground">
				<InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
				<span>
					{quantities.format(data.unconvertibleQty)} servings of leftovers have no recorded serving
					weight, so they sit outside these rates. Give those dishes an average serving weight in
					Catalog to bring them in.
				</span>
			</p>
		)}
	</div>
)

const EmptyRange = () => (
	<Card className="border-dashed">
		<CardHeader>
			<CardTitle className="text-base">No history in the last 30 days</CardTitle>
			<CardDescription>
				Record a close of day and these rates fill in from the leftovers, listings and donations it
				produces.
			</CardDescription>
		</CardHeader>
		<CardContent>
			<Button asChild variant="outline">
				<Link to="/app/leftovers">Record leftovers</Link>
			</Button>
		</CardContent>
	</Card>
)

const LoadFailed = ({ message }: { message: string }) => (
	<Card>
		<CardHeader>
			<CardTitle className="text-base text-critical">Metrics could not be loaded</CardTitle>
			<CardDescription>{message}</CardDescription>
		</CardHeader>
	</Card>
)

export const DashboardPage = () => {
	const { session } = useSession()
	const dashboard = useQuery({
		queryKey: queryKeys.dashboard("", ""),
		queryFn: () => apiGet<Dashboard>("/v1/dashboard"),
	})

	return (
		<section className="w-full">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">
					Good evening, {session?.user.name.split(" ")[0]}
				</h1>
				<p className="mt-1 text-muted-foreground">{session?.tenant.name} · last 30 days</p>
			</header>

			<div className="mt-8 grid gap-6 lg:grid-cols-3">
				<div className="lg:col-span-2">
					{dashboard.isPending && <MetricsSkeleton />}
					{dashboard.error != null && <LoadFailed message={dashboard.error.message} />}
					{dashboard.data != null &&
						(hasHistory(dashboard.data) ? <Metrics data={dashboard.data} /> : <EmptyRange />)}
				</div>

				<ActivityFeed />
			</div>
		</section>
	)
}
