import { ClockIcon, HandHeartIcon, MapPinIcon, StoreIcon, TimerIcon, UsersIcon } from "lucide-react"
import { cn } from "../lib/utils"
import { ClaimButton } from "./claim-button"
import { Badge } from "./ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"

export type MarketListing = {
	id: string
	tenantId: string
	channel: "b2b" | "ngo"
	pricePerUnit: string
	qty: string
	unit: "kg" | "plate" | "piece" | "litre"
	pickupFrom: string
	pickupUntil: string
	safeUntil: string
	claimedByTenantId: string | null
	restaurantName: string
	restaurantCity: string
}

const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 })
const money = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0,
})
const short = new Intl.DateTimeFormat("en-IN", {
	day: "2-digit",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
})

const minutesUntil = (iso: string): number =>
	Math.round((new Date(iso).getTime() - Date.now()) / 60_000)

const urgency = (pickupUntil: string): "soon" | "later" | "expired" => {
	const m = minutesUntil(pickupUntil)
	if (m <= 0) return "expired"
	if (m <= 90) return "soon"
	return "later"
}

export const ListingCard = ({
	listing,
	viewer,
}: {
	listing: MarketListing
	viewer: "buyer" | "owner" | "claimer"
}) => {
	const u = urgency(listing.pickupUntil)
	const priceLabel =
		Number(listing.pricePerUnit) > 0
			? `${money.format(Number(listing.pricePerUnit))} / ${listing.unit}`
			: "Free"

	return (
		<Card className="flex h-full flex-col">
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<CardTitle className="text-base">
							{quantity.format(Number(listing.qty))} {listing.unit}
						</CardTitle>
						<CardDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
							<span className="flex items-center gap-1">
								<MapPinIcon className="size-3" />
								{listing.restaurantName === ""
									? "Listing owner"
									: `${listing.restaurantName}, ${listing.restaurantCity}`}
							</span>
							<span className="font-medium text-foreground">{priceLabel}</span>
						</CardDescription>
					</div>
					{listing.channel === "ngo" ? (
						<Badge variant="secondary">
							<HandHeartIcon /> NGO
						</Badge>
					) : (
						<Badge>
							<StoreIcon /> B2B
						</Badge>
					)}
				</div>
			</CardHeader>
			<CardContent className="mt-auto space-y-3">
				<dl className="grid grid-cols-2 gap-3 text-sm">
					<div>
						<dt className="flex items-center gap-1 text-xs text-muted-foreground">
							<ClockIcon className="size-3" /> Pickup from
						</dt>
						<dd className="font-medium">{short.format(new Date(listing.pickupFrom))}</dd>
					</div>
					<div>
						<dt className="flex items-center gap-1 text-xs text-muted-foreground">
							<ClockIcon className="size-3" /> Until
						</dt>
						<dd
							className={cn(
								"font-medium",
								u === "expired" && "text-muted-foreground line-through",
								u === "soon" && "text-serious",
							)}
						>
							{short.format(new Date(listing.pickupUntil))}
						</dd>
					</div>
					<div className="col-span-2">
						<dt className="flex items-center gap-1 text-xs text-muted-foreground">
							<TimerIcon className="size-3" /> Safe until
						</dt>
						<dd className="font-medium">{short.format(new Date(listing.safeUntil))}</dd>
					</div>
				</dl>
				<div className="flex items-center justify-between gap-2">
					{listing.claimedByTenantId == null ? (
						u === "expired" ? (
							<Badge variant="critical">Window closed</Badge>
						) : (
							<span className="text-xs text-muted-foreground">Available now</span>
						)
					) : (
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<UsersIcon className="size-3" /> Claimed
						</span>
					)}
					{viewer === "claimer" && listing.claimedByTenantId != null ? (
						<ClaimButton mode="release" listingId={listing.id} />
					) : viewer === "buyer" ? (
						u !== "expired" && (
							<ClaimButton mode="claim" listingId={listing.id} channel={listing.channel} />
						)
					) : null}
				</div>
			</CardContent>
		</Card>
	)
}
