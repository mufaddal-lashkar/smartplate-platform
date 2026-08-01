import { createRedis, redis } from "../../shared/redis"

export type EventTopic = "jobs" | "notifications" | "market"

export type DomainEvent = {
	topic: EventTopic
	name: string
	data: Record<string, string | number>
}

const channelFor = (tenantId: string) => `events:${tenantId}`

export const publishEvent = async (tenantId: string, event: DomainEvent) => {
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
