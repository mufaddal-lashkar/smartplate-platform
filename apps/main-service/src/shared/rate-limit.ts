import { ApiError } from "./api-error"
import { redis } from "./redis"

export type RateLimitRule = {
	scope: string
	limit: number
	windowSeconds: number
}

export const AUTH_ATTEMPT_RULE: RateLimitRule = {
	scope: "auth-attempt",
	limit: 10,
	windowSeconds: 900,
}

export const REFRESH_RULE: RateLimitRule = {
	scope: "auth-refresh",
	limit: 60,
	windowSeconds: 3600,
}

export const enforceRateLimit = async (rule: RateLimitRule, key: string, nowMs: number) => {
	const window = Math.floor(nowMs / 1000 / rule.windowSeconds)
	const redisKey = `ratelimit:${rule.scope}:${key}:${window}`

	const count = await redis.incr(redisKey)
	if (count === 1) await redis.expire(redisKey, rule.windowSeconds)

	if (count > rule.limit) {
		throw new ApiError("RATE_LIMITED", "Too many attempts. Try again in a few minutes.")
	}
}

/**
 * nginx sets X-Real-IP to $remote_addr, which a client cannot forge. It also
 * sets X-Forwarded-For with $proxy_add_x_forwarded_for, which APPENDS to any
 * value the client supplied — so the first entry is attacker-controlled and
 * the last entry is the one nginx added.
 */
export const clientAddress = (request: Request): string => {
	const realIp = request.headers.get("x-real-ip")
	if (realIp != null && realIp !== "") return realIp.trim()

	const forwarded = request.headers.get("x-forwarded-for")
	if (forwarded == null || forwarded === "") return "unattributed"

	const hops = forwarded.split(",")
	return hops[hops.length - 1]?.trim() ?? "unattributed"
}
