import { redis } from "../../shared/redis"

const WINDOW_SECONDS = 60 * 60
const MAX_PER_WINDOW = 5

const counterKey = (tenantId: string) => `notify:cap:${tenantId}`

export const incrementNotificationCap = async (tenantId: string): Promise<boolean> => {
	const key = counterKey(tenantId)
	const count = await redis.incr(key)
	if (count === 1) await redis.expire(key, WINDOW_SECONDS)
	return count <= MAX_PER_WINDOW
}
