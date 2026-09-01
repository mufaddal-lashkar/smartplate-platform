import { redis } from "../../shared/redis"

const WINDOW_SECONDS = 24 * 60 * 60

const dedupKey = (tenantId: string, eventName: string, entityId: string) =>
	`notify:dedup:${tenantId}:${eventName}:${entityId}`

export const claimDedupToken = async (
	tenantId: string,
	eventName: string,
	entityId: string,
): Promise<boolean> => {
	const key = dedupKey(tenantId, eventName, entityId)
	const result = await redis.set(key, "1", "EX", WINDOW_SECONDS, "NX")
	return result === "OK"
}
