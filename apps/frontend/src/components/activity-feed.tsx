import {
	ActivityIcon,
	BellIcon,
	CircleCheckIcon,
	HandHeartIcon,
	type LucideIcon,
	TagIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { type AppEvent, type StreamStatus, useEvents } from "../hooks/use-events"
import { cn } from "../lib/utils"
import { Badge } from "./ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"

type EventLabel = {
	icon: LucideIcon
	tone: string
	title: string
	detail: string
}

const TICK_MS = 15_000

const labelFor = (event: AppEvent): EventLabel => {
	if (event.name === "listing.escalated") {
		return {
			icon: HandHeartIcon,
			tone: "text-warning",
			title: "Listing escalated to NGO",
			detail: "No business claimed it in time, so it was offered for donation.",
		}
	}

	if (event.name === "listing.created") {
		const toNgo = event.data.channel === "ngo"
		return {
			icon: TagIcon,
			tone: "text-primary",
			title: toNgo ? "Surplus offered to NGOs" : "Surplus offered to nearby businesses",
			detail: toNgo ? "A donation pickup is open." : "A discounted pickup is open.",
		}
	}

	if (event.name === "job.completed") {
		return {
			icon: CircleCheckIcon,
			tone: "text-good",
			title: "Background job finished",
			detail: `Queue ${event.data.kind}`,
		}
	}

	return {
		icon: BellIcon,
		tone: "text-muted-foreground",
		title: "Notification sent",
		detail: "Someone on your team was told about a change.",
	}
}

const relativeTime = (receivedAt: number, now: number): string => {
	const seconds = Math.max(0, Math.round((now - receivedAt) / 1000))
	if (seconds < 45) return "just now"

	const minutes = Math.round(seconds / 60)
	if (minutes < 60) return `${minutes} min ago`

	const hours = Math.round(minutes / 60)
	return `${hours} hr ago`
}

const statusLabel = (status: StreamStatus): string => {
	if (status === "open") return "Live"
	if (status === "connecting") return "Connecting…"
	return "Reconnecting…"
}

export const ActivityFeed = () => {
	const { events, status } = useEvents()
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), TICK_MS)
		return () => clearInterval(timer)
	}, [])

	return (
		<Card className="h-full">
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<div>
						<CardTitle className="text-base">Activity</CardTitle>
						<CardDescription>Listings, escalations and jobs as they happen.</CardDescription>
					</div>
					<Badge variant={status === "open" ? "good" : "warning"}>{statusLabel(status)}</Badge>
				</div>
			</CardHeader>

			<CardContent>
				{events.length === 0 ? (
					<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
						<ActivityIcon className="size-5 text-muted-foreground" />
						<p className="text-sm font-medium">Nothing has happened yet</p>
						<p className="text-xs text-muted-foreground">
							Confirm a close of day and the listings, escalations and background jobs it sets off
							show up here as they happen.
						</p>
					</div>
				) : (
					<ol className="space-y-4">
						{events.map((event) => {
							const label = labelFor(event)
							return (
								<li key={event.id} className="flex gap-3">
									<label.icon
										className={cn("mt-0.5 size-4 shrink-0", label.tone)}
										aria-hidden="true"
									/>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium leading-tight">{label.title}</p>
										<p className="mt-0.5 text-xs text-muted-foreground">{label.detail}</p>
									</div>
									<span className="shrink-0 text-xs tabular text-muted-foreground">
										{relativeTime(event.receivedAt, now)}
									</span>
								</li>
							)
						})}
					</ol>
				)}
			</CardContent>
		</Card>
	)
}
