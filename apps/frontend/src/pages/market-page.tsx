import type { Collection } from "@smartplate/contracts/envelope"
import { useQuery } from "@tanstack/react-query"
import {
	CircleAlertIcon,
	HandHeartIcon,
	InboxIcon,
	RefreshCwIcon,
	ShoppingBasketIcon,
	StoreIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { ListingCard, type MarketListing } from "../components/listing-card"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Skeleton } from "../components/ui/skeleton"
import { apiGet } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { cn } from "../lib/utils"

type ChannelFilter = "all" | "b2b" | "ngo"

export const MarketPage = () => {
	const [filter, setFilter] = useState<ChannelFilter>("all")

	const browseQuery = useQuery({
		queryKey: queryKeys.marketBrowse(),
		queryFn: () => apiGet<Collection<MarketListing>>("/v1/market"),
		refetchInterval: 30_000,
	})

	const listings = browseQuery.data?.items ?? []
	const filtered = useMemo(
		() => (filter === "all" ? listings : listings.filter((row) => row.channel === filter)),
		[filter, listings],
	)

	const freeCount = listings.filter((row) => Number(row.pricePerUnit) === 0).length
	const paidCount = listings.length - freeCount

	return (
		<section className="w-full">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Browse surplus</h1>
					<p className="mt-1 text-muted-foreground">
						Open offers from restaurants in your radius. Claim before pickup closes.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<FilterPill value="all" current={filter} onSelect={setFilter} icon={ShoppingBasketIcon}>
						All
					</FilterPill>
					<FilterPill value="b2b" current={filter} onSelect={setFilter} icon={StoreIcon}>
						B2B
					</FilterPill>
					<FilterPill value="ngo" current={filter} onSelect={setFilter} icon={HandHeartIcon}>
						NGO
					</FilterPill>
				</div>
			</header>

			<div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
				<SummaryTile label="Open offers" value={String(listings.length)} />
				<SummaryTile label="Discounted" value={String(paidCount)} />
				<SummaryTile label="Free" value={String(freeCount)} />
			</div>

			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="text-base">Available now</CardTitle>
					<CardDescription>
						{browseQuery.isPending
							? "Loading the market…"
							: `${filtered.length} offer${filtered.length === 1 ? "" : "s"} in your radius`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{browseQuery.isPending && (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
							<Skeleton className="h-44 w-full" />
							<Skeleton className="h-44 w-full" />
							<Skeleton className="h-44 w-full" />
						</div>
					)}

					{browseQuery.error != null && (
						<div role="alert" className="rounded-lg bg-critical/10 p-4 text-sm text-critical">
							<p className="flex items-center gap-2 font-medium">
								<CircleAlertIcon className="size-4" /> Could not load the market
							</p>
							<p className="mt-1">{browseQuery.error.message}</p>
							<Button
								variant="outline"
								size="sm"
								className="mt-3"
								onClick={() => browseQuery.refetch()}
							>
								<RefreshCwIcon /> Try again
							</Button>
						</div>
					)}

					{!browseQuery.isPending && browseQuery.error == null && filtered.length === 0 && (
						<div className="rounded-lg border border-dashed p-10 text-center">
							<InboxIcon className="mx-auto size-6 text-muted-foreground" />
							<p className="mt-3 font-medium">Nothing available right now</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Check back in a few minutes — new offers appear as restaurants close their day.
							</p>
						</div>
					)}

					{filtered.length > 0 && (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
							{filtered.map((listing) => (
								<ListingCard key={listing.id} listing={listing} viewer="buyer" />
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</section>
	)
}

const SummaryTile = ({ label, value }: { label: string; value: string }) => (
	<div className="rounded-lg border bg-card p-4">
		<p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
		<p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
	</div>
)

const FilterPill = ({
	value,
	current,
	onSelect,
	icon: Icon,
	children,
}: {
	value: ChannelFilter
	current: ChannelFilter
	onSelect: (next: ChannelFilter) => void
	icon: typeof StoreIcon
	children: React.ReactNode
}) => {
	const active = value === current
	return (
		<button
			type="button"
			onClick={() => onSelect(value)}
			className={cn(
				"inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
				active
					? "border-primary bg-primary text-primary-foreground"
					: "border-border bg-background text-muted-foreground hover:text-foreground",
			)}
		>
			<Icon className="size-3" />
			{children}
		</button>
	)
}
