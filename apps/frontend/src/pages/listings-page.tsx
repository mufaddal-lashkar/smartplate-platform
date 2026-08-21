import type { Collection } from "@smartplate/contracts/envelope"
import { useQuery } from "@tanstack/react-query"
import {
	CheckCircle2Icon,
	ChevronRightIcon,
	CircleAlertIcon,
	HandHeartIcon,
	InboxIcon,
	RefreshCwIcon,
	StoreIcon,
	TimerIcon,
	XCircleIcon,
} from "lucide-react"
import { Fragment, useEffect, useState } from "react"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Skeleton } from "../components/ui/skeleton"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../components/ui/table"
import { apiGet } from "../lib/api-client"
import { queryKeys } from "../lib/query-keys"
import { cn } from "../lib/utils"

type ListingEvent = {
	event: string
	detail: string
	occurredAt: string
}

type ListingItem = {
	leftoverId: string
	qty: string
}

type Listing = {
	id: string
	channel: string
	status: string
	qty: string
	unit: string
	pricePerUnit: string
	pickupFrom: string
	pickupUntil: string
	safeUntil: string
	escalateAt: string | null
	createdAt: string
	events: ListingEvent[]
	items: ListingItem[]
}

const EVENT_LABELS: Record<string, string> = {
	created: "Listed",
	escalated: "Escalated to NGOs",
	claimed: "Claimed",
	completed: "Collected",
	expired: "Expired",
	cancelled: "Cancelled",
}

const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const money = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0,
})
const timestamp = new Intl.DateTimeFormat("en-IN", {
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
})

const eventLabel = (event: string): string => {
	const known = EVENT_LABELS[event]
	return known === "" || known == null ? event : known
}

const eventDetail = (event: string, detail: string): string => {
	if (event !== "created") return detail
	if (detail === "b2b") return "Offered to nearby businesses at a discount."
	if (detail === "ngo") return "Offered to NGOs for collection."
	return detail
}

const secondsUntil = (iso: string): number =>
	Math.round((new Date(iso).getTime() - Date.now()) / 1000)

const countdownLabel = (seconds: number): string => {
	if (seconds <= 0) return "escalating now"
	if (seconds < 60) return `in ${seconds}s`
	if (seconds < 3600) return `in ${Math.round(seconds / 60)} min`
	return `in ${Math.round(seconds / 3600)} h`
}

const ChannelBadge = ({ channel }: { channel: string }) =>
	channel === "ngo" ? (
		<Badge variant="secondary">
			<HandHeartIcon /> NGO
		</Badge>
	) : (
		<Badge>
			<StoreIcon /> B2B
		</Badge>
	)

const StatusBadge = ({ status }: { status: string }) => {
	if (status === "completed")
		return (
			<Badge variant="good">
				<CheckCircle2Icon /> Collected
			</Badge>
		)
	if (status === "claimed")
		return (
			<Badge variant="good">
				<CheckCircle2Icon /> Claimed
			</Badge>
		)
	if (status === "expired" || status === "cancelled")
		return (
			<Badge variant="critical">
				<XCircleIcon /> {status === "expired" ? "Expired" : "Cancelled"}
			</Badge>
		)
	return (
		<Badge variant="warning">
			<TimerIcon /> Open
		</Badge>
	)
}

const EscalationCountdown = ({ escalateAt }: { escalateAt: string }) => {
	const [seconds, setSeconds] = useState(() => secondsUntil(escalateAt))

	useEffect(() => {
		setSeconds(secondsUntil(escalateAt))
		const timer = window.setInterval(() => setSeconds(secondsUntil(escalateAt)), 1000)
		return () => window.clearInterval(timer)
	}, [escalateAt])

	return (
		<span className={cn("flex items-center gap-1 text-xs", seconds <= 0 && "text-serious")}>
			<TimerIcon className="size-3" />
			Escalates to NGOs {countdownLabel(seconds)}
		</span>
	)
}

const Timeline = ({ listing }: { listing: Listing }) => (
	<div className="rounded-lg border bg-muted/40 p-4">
		<div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
			<span>Pickup window {timestamp.format(new Date(listing.pickupFrom))}</span>
			<span>until {timestamp.format(new Date(listing.pickupUntil))}</span>
			<span>Safe until {timestamp.format(new Date(listing.safeUntil))}</span>
			<span>
				{listing.items.length} contributing leftover{listing.items.length === 1 ? "" : "s"}
			</span>
		</div>

		{listing.events.length === 0 ? (
			<p className="mt-3 text-sm text-muted-foreground">No events recorded yet.</p>
		) : (
			<ol className="mt-4 space-y-3">
				{listing.events.map((event) => (
					<li key={`${event.event}-${event.occurredAt}`} className="flex gap-3">
						<span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
						<div className="min-w-0">
							<p className="text-sm font-medium">{eventLabel(event.event)}</p>
							{event.detail !== "" && (
								<p className="text-sm text-muted-foreground">
									{eventDetail(event.event, event.detail)}
								</p>
							)}
							<p className="text-xs text-muted-foreground tabular-nums">
								{timestamp.format(new Date(event.occurredAt))}
							</p>
						</div>
					</li>
				))}
			</ol>
		)}
	</div>
)

export const ListingsPage = () => {
	const [expandedId, setExpandedId] = useState("")

	const listingsQuery = useQuery({
		queryKey: queryKeys.listings(),
		queryFn: () => apiGet<Collection<Listing>>("/v1/listings"),
		refetchInterval: 15_000,
	})

	const listings = listingsQuery.data?.items ?? []
	const openCount = listings.filter((listing) => listing.status === "open").length

	return (
		<section className="w-full">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">My listings</h1>
				<p className="mt-1 text-muted-foreground">
					Every pickup you have offered, and what happened to it.
				</p>
			</header>

			<Card className="mt-8">
				<CardHeader>
					<CardTitle className="text-base">Offers</CardTitle>
					<CardDescription>
						{listingsQuery.isPending
							? "Loading your listings…"
							: `${listings.length} listing${listings.length === 1 ? "" : "s"} · ${openCount} still open`}
					</CardDescription>
				</CardHeader>

				<CardContent>
					{listingsQuery.isPending && (
						<div className="space-y-2">
							<Skeleton className="h-11 w-full" />
							<Skeleton className="h-14 w-full" />
							<Skeleton className="h-14 w-full" />
							<Skeleton className="h-14 w-full" />
						</div>
					)}

					{listingsQuery.error != null && (
						<div role="alert" className="rounded-lg bg-critical/10 p-4 text-sm text-critical">
							<p className="flex items-center gap-2 font-medium">
								<CircleAlertIcon className="size-4" /> Could not load your listings
							</p>
							<p className="mt-1">{listingsQuery.error.message}</p>
							<Button
								variant="outline"
								size="sm"
								className="mt-3"
								onClick={() => listingsQuery.refetch()}
							>
								<RefreshCwIcon /> Try again
							</Button>
						</div>
					)}

					{!listingsQuery.isPending && listingsQuery.error == null && listings.length === 0 && (
						<div className="rounded-lg border border-dashed p-10 text-center">
							<InboxIcon className="mx-auto size-6 text-muted-foreground" />
							<p className="mt-3 font-medium">No listings yet</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Confirm a close of day with a sell or donate quantity and the pickup appears here.
							</p>
						</div>
					)}

					{listings.length > 0 && (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10" />
									<TableHead>Channel</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Quantity</TableHead>
									<TableHead>Price</TableHead>
									<TableHead>Created</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{listings.map((listing) => {
									const expanded = listing.id === expandedId
									const showCountdown =
										listing.status === "open" &&
										listing.channel === "b2b" &&
										listing.escalateAt !== null

									return (
										<Fragment key={listing.id}>
											<TableRow
												className="cursor-pointer"
												onClick={() => setExpandedId(expanded ? "" : listing.id)}
											>
												<TableCell>
													<ChevronRightIcon
														className={cn(
															"size-4 text-muted-foreground transition-transform",
															expanded && "rotate-90",
														)}
													/>
													<span className="sr-only">
														{expanded ? "Hide timeline" : "Show timeline"}
													</span>
												</TableCell>
												<TableCell>
													<ChannelBadge channel={listing.channel} />
												</TableCell>
												<TableCell>
													<StatusBadge status={listing.status} />
													{showCountdown && listing.escalateAt !== null && (
														<EscalationCountdown escalateAt={listing.escalateAt} />
													)}
												</TableCell>
												<TableCell>
													{quantity.format(Number(listing.qty))} {listing.unit}
												</TableCell>
												<TableCell>
													{Number(listing.pricePerUnit) > 0 ? (
														`${money.format(Number(listing.pricePerUnit))} / ${listing.unit}`
													) : (
														<span className="text-muted-foreground">Free</span>
													)}
												</TableCell>
												<TableCell className="text-muted-foreground">
													{timestamp.format(new Date(listing.createdAt))}
												</TableCell>
											</TableRow>

											{expanded && (
												<TableRow className="hover:bg-transparent">
													<TableCell colSpan={6} className="pt-0 pb-4">
														<Timeline listing={listing} />
													</TableCell>
												</TableRow>
											)}
										</Fragment>
									)
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</section>
	)
}
