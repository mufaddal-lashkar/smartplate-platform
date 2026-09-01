import type { Collection } from "@smartplate/contracts/envelope"
import { useQuery } from "@tanstack/react-query"
import {
	CircleAlertIcon,
	HandHeartIcon,
	InboxIcon,
	RefreshCwIcon,
	ShieldCheckIcon,
} from "lucide-react"
import { useSession } from "../../auth/use-session"
import { ListingCard, type MarketListing } from "../../components/listing-card"
import { ReliabilityBadge, reliabilityPercent } from "../../components/reliability-badge"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Skeleton } from "../../components/ui/skeleton"
import { apiGet } from "../../lib/api-client"
import { queryKeys } from "../../lib/query-keys"

export const NgoIndexPage = () => {
	const { session } = useSession()
	const browseQuery = useQuery({
		queryKey: queryKeys.marketBrowse(),
		queryFn: () => apiGet<Collection<MarketListing>>("/v1/market"),
		refetchInterval: 30_000,
	})

	const pickupsQuery = useQuery({
		queryKey: queryKeys.marketPickups(),
		queryFn: () => apiGet<Collection<MarketListing>>("/v1/market/pickups"),
		refetchInterval: 30_000,
	})

	const offers = browseQuery.data?.items.filter((row) => row.channel === "ngo") ?? []
	const pickups = pickupsQuery.data?.items ?? []
	const claimed = pickups.length
	const noShows = pickups.filter((row) => row.claimedByTenantId == null).length
	const role = session?.user.role ?? "ngo_volunteer"
	const verified = session?.tenant.verified === true

	return (
		<section className="w-full">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">Available food</h1>
					<p className="mt-1 text-muted-foreground">
						Open offers from restaurants near you. Reserve before the pickup window closes.
					</p>
				</div>
				<ReliabilityBadge claimed={claimed} noShows={noShows} />
			</header>

			{!verified && role !== "super_admin" && (
				<div className="mt-4 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-serious">
					<ShieldCheckIcon className="size-4" />
					<span>Your organisation is pending verification. Browse and claim remain read-only.</span>
				</div>
			)}

			<div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div className="rounded-lg border bg-card p-4">
					<p className="text-xs uppercase tracking-wide text-muted-foreground">Available</p>
					<p className="mt-1 font-display text-2xl font-semibold tabular-nums">{offers.length}</p>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<p className="text-xs uppercase tracking-wide text-muted-foreground">Pickups</p>
					<p className="mt-1 font-display text-2xl font-semibold tabular-nums">{claimed}</p>
				</div>
				<div className="rounded-lg border bg-card p-4">
					<p className="text-xs uppercase tracking-wide text-muted-foreground">Reliability</p>
					<p className="mt-1 font-display text-2xl font-semibold tabular-nums">
						{reliabilityPercent(claimed, noShows)}%
					</p>
				</div>
			</div>

			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="text-base">Available now</CardTitle>
					<CardDescription>
						{browseQuery.isPending
							? "Loading offers…"
							: `${offers.length} offer${offers.length === 1 ? "" : "s"} from nearby restaurants`}
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
								<CircleAlertIcon className="size-4" /> Could not load offers
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

					{!browseQuery.isPending && browseQuery.error == null && offers.length === 0 && (
						<div className="rounded-lg border border-dashed p-10 text-center">
							<InboxIcon className="mx-auto size-6 text-muted-foreground" />
							<p className="mt-3 font-medium">No NGO offers right now</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Restaurants post donation listings after their close-of-day.
							</p>
						</div>
					)}

					{offers.length > 0 && (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
							{offers.map((listing) => (
								<ListingCard
									key={listing.id}
									listing={listing}
									viewer={verified ? "buyer" : "owner"}
								/>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{pickups.length > 0 && (
				<Card className="mt-6">
					<CardHeader>
						<CardTitle className="text-base">In progress</CardTitle>
						<CardDescription>Pickups you have reserved and are awaiting.</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
							{pickups.map((listing) => (
								<ListingCard key={listing.id} listing={listing} viewer="claimer" />
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</section>
	)
}

export const _ChannelBadge = () => (
	<Badge variant="secondary">
		<HandHeartIcon /> NGO
	</Badge>
)
