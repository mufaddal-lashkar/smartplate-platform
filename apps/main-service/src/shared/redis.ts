import Redis from "ioredis"

export const createRedis = (): Redis =>
	new Redis(process.env.REDIS_URL ?? "redis://redis:6379", { maxRetriesPerRequest: null })

export const redis = createRedis()
