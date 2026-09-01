import type { Collection } from "@smartplate/contracts/envelope"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	CheckCircle2Icon,
	CircleAlertIcon,
	InboxIcon,
	PackageIcon,
	RefreshCwIcon,
} from "lucide-react"
import { useState } from "react"
import { ListingCard, type MarketListing } from "../../components/listing-card"
import { ReliabilityBadge } from "../../components/reliability-badge"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Skeleton } from "../../components/ui/skeleton"
import { apiGet, apiPostIdempotent } from "../../lib/api-client"
import { queryKeys } from "../../lib/query-keys"

export const NgoPickupsPage = () => {
	const queryClient = useQueryClient()
	const [key] = useState(() => crypto.randomUUID())

	const pickupsQuery = useQuery({
		queryKey: queryKeys.marketPickups(),
		queryFn: () => apiGet<Collection<MarketListing>>("/v1/market/pickups"),
		refetchInterval: 30_000,
	})

	const completeMutation = useMutation({
		mutationFn: async (listingId: string) =>
			apiPostIdempotent<{ listingId: string }>(`/v1/listings/${listingId}/complete`, {}, key),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.marketPickups() })
			queryClient.invalidateQueries({ queryKey: queryKeys.marketBrowse() })
			queryClient.invalidateQueries({ queryKey: queryKeys.listings() })
		},
	})

	const releaseMutation = useMutation({
		mutationFn: async (listingId: string) =>
			apiPostIdempotent<{ released: true }>(`/v1/market/${listingId}/release`, {}, key),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.marketPickups() })
			queryClient.invalidateQueries({ queryKey: queryKeys.marketBrowse() })
		},
	})

	const pickups = pickupsQuery.data?.items ?? []
	const claimed = pickups.length

	return (
		<section className="w-full">
			<header className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">My pickups</h1>
					<p className="mt-1 text-muted-foreground">
						Listings you have reserved. Mark collected when food arrives, or release back to the
						pool.
					</p>
				</div>
				<ReliabilityBadge claimed={claimed} noShows={0} />
			</header>

			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="text-base">In flight</CardTitle>
					<CardDescription>
						{pickupsQuery.isPending
							? "Loading pickups…"
							: `${pickups.length} pickup${pickups.length === 1 ? "" : "s"} scheduled`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{pickupsQuery.isPending && (
						<div className="space-y-2">
							<Skeleton className="h-32 w-full" />
							<Skeleton className="h-32 w-full" />
						</div>
					)}

					{pickupsQuery.error != null && (
						<div role="alert" className="rounded-lg bg-critical/10 p-4 text-sm text-critical">
							<p className="flex items-center gap-2 font-medium">
								<CircleAlertIcon className="size-4" /> Could not load pickups
							</p>
							<p className="mt-1">{pickupsQuery.error.message}</p>
							<Button
								variant="outline"
								size="sm"
								className="mt-3"
								onClick={() => pickupsQuery.refetch()}
							>
								<RefreshCwIcon /> Try again
							</Button>
						</div>
					)}

					{!pickupsQuery.isPending && pickupsQuery.error == null && pickups.length === 0 && (
						<div className="rounded-lg border border-dashed p-10 text-center">
							<PackageIcon className="mx-auto size-6 text-muted-foreground" />
							<p className="mt-3 font-medium">No pickups scheduled</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Reserve an available offer to plan a run.
							</p>
						</div>
					)}

					{pickups.length > 0 && (
						<ul className="space-y-3">
							{pickups.map((listing) => (
								<li key={listing.id} className="rounded-lg border bg-card p-4">
									<div className="flex flex-wrap items-center justify-between gap-3">
										<div className="min-w-0">
											<p className="font-medium">
												{Number(listing.qty).toLocaleString("en-IN")} {listing.unit}
											</p>
											<p className="text-sm text-muted-foreground">
												From{" "}
												{listing.restaurantName === "" ? "the restaurant" : listing.restaurantName}
												{" · "}
												pickup by{" "}
												{new Date(listing.pickupUntil).toLocaleString("en-IN", {
													day: "2-digit",
													month: "short",
													hour: "2-digit",
													minute: "2-digit",
												})}
											</p>
										</div>
										<div className="flex flex-wrap gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => releaseMutation.mutate(listing.id)}
												disabled={releaseMutation.isPending}
											>
												Release
											</Button>
											<Button
												size="sm"
												onClick={() => completeMutation.mutate(listing.id)}
												disabled={completeMutation.isPending}
											>
												<CheckCircle2Icon /> Mark collected
											</Button>
										</div>
									</div>
									<div className="mt-3">
										<ListingCard listing={listing} viewer="claimer" />
									</div>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</section>
	)
}
