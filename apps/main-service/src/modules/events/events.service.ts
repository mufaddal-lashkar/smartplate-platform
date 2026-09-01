import { createRedis, redis } from "../../shared/redis"
import { incrementNotificationCap } from "./events.cap"
import { claimDedupToken } from "./events.dedup"

export type EventTopic = "jobs" | "notifications" | "market"

export type DomainEvent = {
	topic: EventTopic
	name: string
	data: Record<string, string | number>
}

const channelFor = (tenantId: string) => `events:${tenantId}`

const entityIdFor = (data: Record<string, string | number>): string => {
	const raw = data.entityId ?? data.listingId ?? data.leftoverId ?? ""
	return String(raw)
}

export const publishEvent = async (tenantId: string, event: DomainEvent): Promise<void> => {
	if (event.topic === "notifications") {
		const entityId = entityIdFor(event.data)
		if (entityId !== "") {
			const fresh = await claimDedupToken(tenantId, event.name, entityId)
			if (!fresh) return
		}
		const withinCap = await incrementNotificationCap(tenantId)
		if (!withinCap) return
	}
	await redis.publish(channelFor(tenantId), JSON.stringify(event))
}

export const subscribeToTenant = (
	tenantId: string,
	onEvent: (event: DomainEvent) => void,
): (() => void) => {
	const subscriber = createRedis()

	subscriber.subscribe(channelFor(tenantId))
	subscriber.on("message", (_channel, payload) => {
		onEvent(JSON.parse(payload) as DomainEvent)
	})

	return () => {
		subscriber.disconnect()
	}
}
