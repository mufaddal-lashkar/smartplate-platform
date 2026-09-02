import { config } from "./config"
import { redis } from "./db"
import { logger } from "./logger"

export type BotSession = {
	accessToken: string
	refreshToken: string
	expiresAt: number
	tenantId: string
	tenantType: "restaurant" | "ngo"
	role: string
	userId: string
}

type SessionResponse = {
	accessToken: string
	refreshToken: string
	expiresIn: number
	tenantId: string
	tenantType: "restaurant" | "ngo"
	role: string
	userId: string
}

const sessionKey = (chatId: number) => `bot:session:${chatId}`

const serviceHeaders = (): Record<string, string> => ({
	"x-service-token": config.serviceToken,
	"content-type": "application/json",
})

const isExpiringSoon = (session: BotSession): boolean => {
	const now = Math.floor(Date.now() / 1000)
	return session.expiresAt - now < 60
}

const fetchSession = async (chatId: number): Promise<BotSession | null> => {
	const raw = await redis.get(sessionKey(chatId))
	if (raw == null) return null
	return JSON.parse(raw) as BotSession
}

const writeSession = async (chatId: number, session: BotSession): Promise<void> => {
	await redis.set(sessionKey(chatId), JSON.stringify(session), "EX", 30 * 24 * 60 * 60)
}

const refreshSession = async (chatId: number, refreshToken: string): Promise<BotSession> => {
	const response = await fetch(`${config.mainUrl}/v1/bot/session`, {
		method: "POST",
		headers: serviceHeaders(),
		body: JSON.stringify({ refreshToken }),
	})
	if (!response.ok) {
		throw new Error(`bot session refresh failed: ${response.status}`)
	}
	const body = (await response.json()) as { data?: SessionResponse }
	if (body.data == null) throw new Error("bot session refresh returned no data")
	const session: BotSession = {
		accessToken: body.data.accessToken,
		refreshToken: body.data.refreshToken ?? refreshToken,
		expiresAt: Math.floor(Date.now() / 1000) + body.data.expiresIn,
		tenantId: body.data.tenantId,
		tenantType: body.data.tenantType,
		role: body.data.role,
		userId: body.data.userId,
	}
	await writeSession(chatId, session)
	return session
}

const tenantSessionKey = (tenantId: string) => `bot:tenant-session:${tenantId}`

export const getTenantSession = async (tenantId: string): Promise<BotSession | null> => {
	const raw = await redis.get(tenantSessionKey(tenantId))
	if (raw == null) return null
	const session = JSON.parse(raw) as BotSession
	if (!isExpiringSoon(session)) return session
	return refreshTenantSession(tenantId, session.refreshToken)
}

const writeTenantSession = async (tenantId: string, session: BotSession): Promise<void> => {
	await redis.set(tenantSessionKey(tenantId), JSON.stringify(session), "EX", 30 * 24 * 60 * 60)
}

const refreshTenantSession = async (
	tenantId: string,
	refreshToken: string,
): Promise<BotSession> => {
	const response = await fetch(`${config.mainUrl}/v1/bot/session`, {
		method: "POST",
		headers: serviceHeaders(),
		body: JSON.stringify({ refreshToken }),
	})
	if (!response.ok) {
		throw new Error(`tenant session refresh failed: ${response.status}`)
	}
	const body = (await response.json()) as { data?: SessionResponse }
	if (body.data == null) throw new Error("tenant session refresh returned no data")
	const session: BotSession = {
		accessToken: body.data.accessToken,
		refreshToken: body.data.refreshToken ?? refreshToken,
		expiresAt: Math.floor(Date.now() / 1000) + body.data.expiresIn,
		tenantId: body.data.tenantId,
		tenantType: body.data.tenantType,
		role: body.data.role,
		userId: body.data.userId,
	}
	await writeTenantSession(tenantId, session)
	return session
}

export const setTenantSession = async (tenantId: string, session: BotSession): Promise<void> => {
	await writeTenantSession(tenantId, session)
}

export const clearTenantSession = async (tenantId: string): Promise<void> => {
	await redis.del(tenantSessionKey(tenantId))
}

export const getSession = async (chatId: number): Promise<BotSession | null> => {
	const existing = await fetchSession(chatId)
	if (existing == null) return null
	if (!isExpiringSoon(existing)) return existing
	return refreshSession(chatId, existing.refreshToken)
}

export const setSession = async (chatId: number, session: BotSession): Promise<void> => {
	await writeSession(chatId, session)
}

export const clearSession = async (chatId: number): Promise<void> => {
	await redis.del(sessionKey(chatId))
}

export const bindChat = async (
	chatId: number,
	tenantCode: string,
	email: string,
): Promise<BotSession> => {
	const response = await fetch(`${config.mainUrl}/v1/bot/bind`, {
		method: "POST",
		headers: serviceHeaders(),
		body: JSON.stringify({ chatId, tenantCode, email }),
	})
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as {
			error?: { message?: string }
		} | null
		throw new Error(body?.error?.message ?? `bind failed: ${response.status}`)
	}
	const data = ((await response.json()) as { data: { refreshToken: string; expiresIn: number } })
		.data
	const session = await refreshSession(chatId, data.refreshToken)
	return session
}

export const unbindChat = async (chatId: number): Promise<void> => {
	await fetch(`${config.mainUrl}/v1/bot/bind/${chatId}`, {
		method: "DELETE",
		headers: serviceHeaders(),
	})
	await clearSession(chatId)
}

const userHeaders = (session: BotSession, idempotencyKey?: string): Record<string, string> => {
	const headers: Record<string, string> = {
		authorization: `Bearer ${session.accessToken}`,
		"content-type": "application/json",
		"x-tenant-id": session.tenantId,
		"x-user-id": session.userId,
	}
	if (idempotencyKey != null) headers["Idempotency-Key"] = idempotencyKey
	return headers
}

export type RequestOptions = {
	method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
	body?: unknown
	idempotencyKey?: string
	signal?: AbortSignal
}

export const callMain = async <T = unknown>(
	chatId: number,
	path: string,
	options: RequestOptions = {},
): Promise<T> => {
	const session = await getSession(chatId)
	if (session == null) {
		throw new Error("chat is not bound. Run /start first.")
	}

	const headers = userHeaders(session, options.idempotencyKey)
	const response = await fetch(`${config.mainUrl}${path}`, {
		method: options.method ?? "GET",
		headers,
		body: options.body == null ? null : JSON.stringify(options.body),
		signal: options.signal ?? AbortSignal.timeout(config.requestTimeoutMs),
	}).catch((error: Error) => {
		logger.warn({ path, error: error.message }, "main call network error")
		return null
	})

	if (response == null) {
		throw new Error("main service unreachable")
	}

	if (response.status === 401) {
		const refreshed = await refreshSession(chatId, session.refreshToken)
		const retry = await fetch(`${config.mainUrl}${path}`, {
			method: options.method ?? "GET",
			headers: userHeaders(refreshed, options.idempotencyKey),
			body: options.body == null ? null : JSON.stringify(options.body),
			signal: options.signal ?? AbortSignal.timeout(config.requestTimeoutMs),
		})
		if (!retry.ok) {
			const text = await retry.text().catch(() => "")
			throw new Error(`main service returned ${retry.status}: ${text}`)
		}
		const json = (await retry.json()) as { data: T }
		return json.data
	}

	if (!response.ok) {
		const text = await response.text().catch(() => "")
		throw new Error(`main service returned ${response.status}: ${text}`)
	}

	const json = (await response.json()) as { data: T }
	return json.data
}

export const callMainRaw = async <T = unknown>(
	chatId: number,
	path: string,
	options: RequestOptions = {},
): Promise<{ status: number; body: T }> => {
	const session = await getSession(chatId)
	if (session == null) throw new Error("chat is not bound. Run /start first.")
	const response = await fetch(`${config.mainUrl}${path}`, {
		method: options.method ?? "GET",
		headers: userHeaders(session, options.idempotencyKey),
		body: options.body == null ? null : JSON.stringify(options.body),
		signal: options.signal ?? AbortSignal.timeout(config.requestTimeoutMs),
	})
	const body = (await response.json().catch(() => null)) as T
	return { status: response.status, body }
}

export const callMainBinary = async (chatId: number, path: string): Promise<Uint8Array> => {
	const session = await getSession(chatId)
	if (session == null) throw new Error("chat is not bound. Run /start first.")
	const response = await fetch(`${config.mainUrl}${path}`, {
		headers: userHeaders(session),
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	})
	if (!response.ok) {
		throw new Error(`main service returned ${response.status}`)
	}
	const buffer = await response.arrayBuffer()
	return new Uint8Array(buffer)
}
