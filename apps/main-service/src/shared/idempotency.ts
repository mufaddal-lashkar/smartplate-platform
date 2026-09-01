import { createHash } from "node:crypto"
import type { Context } from "elysia"
import { ApiError } from "./api-error"
import { redis } from "./redis"

const TTL_SECONDS = 24 * 60 * 60

const hashBody = (body: unknown): string => {
	const json = JSON.stringify(body ?? null)
	return createHash("sha256").update(json).digest("hex")
}

const cacheKey = (tenantId: string, key: string) => `idem:${tenantId}:${key}`

type CachedResponse = {
	bodyHash: string
	response: unknown
}

export const readIdempotent = async <T>(
	tenantId: string,
	key: string,
	body: unknown,
): Promise<T | null> => {
	const stored = await redis.get(cacheKey(tenantId, key))
	if (stored == null) return null
	const parsed = JSON.parse(stored) as CachedResponse
	if (parsed.bodyHash !== hashBody(body)) {
		throw new ApiError(
			"IDEMPOTENCY_KEY_CONFLICT",
			"This Idempotency-Key was used with a different request body.",
		)
	}
	return parsed.response as T
}

export const writeIdempotent = async <T>(
	tenantId: string,
	key: string,
	body: unknown,
	response: T,
): Promise<void> => {
	const payload: CachedResponse = { bodyHash: hashBody(body), response }
	await redis.set(cacheKey(tenantId, key), JSON.stringify(payload), "EX", TTL_SECONDS)
}

export const requireIdempotencyKey = (ctx: Context): string => {
	const key = ctx.request.headers.get("idempotency-key") ?? ""
	if (key === "") {
		throw new ApiError("VALIDATION_FAILED", "This endpoint requires an Idempotency-Key header.", [
			{ field: "Idempotency-Key", code: "REQUIRED", message: "Header is required." },
		])
	}
	return key
}
