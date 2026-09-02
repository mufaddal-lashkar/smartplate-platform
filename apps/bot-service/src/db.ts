import Redis from "ioredis"
import { config } from "./config"

export const createRedis = (): Redis => new Redis(config.redisUrl, { maxRetriesPerRequest: null })

export const redis = createRedis()
