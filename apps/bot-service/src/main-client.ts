import type { ErrorCode } from "@smartplate/contracts/error-codes"
import { config } from "./config"
import { redis } from "./db"
import { logger } from "./logger"

export class MainApiError extends Error {
	readonly code: ErrorCode
	readonly status: number

	constructor(code: ErrorCode, status: number, message: string) {
		super(message)
		this.name = "MainApiError"
		this.code = code
		this.status = status
	}
}

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

type Envelope<T> = {
	success: boolean
	data: T
	error: { code: ErrorCode; message: string } | null
}

const sessionKey = (chatId: number) => `bot:session:${chatId}`
const tenantSessionKey = (tenantId: string) => `bot:tenant-session:${tenantId}`

const serviceHeaders = (): Record<string, string> => ({
	"x-service-token": config.serviceToken,
	"content-type": "application/json",
})

const isExpiringSoon = (session: BotSession): boolean =>
	session.expiresAt - Math.floor(Date.now() / 1000) < 60

const readEnvelope = async <T>(response: Response): Promise<T> => {
	const body = (await response.json().catch(() => null)) as Envelope<T> | null
	if (body == null) {
		throw new MainApiError("INTERNAL", response.status, "main service returned no body")
	}
	if (body.success === false) {
		const code = body.error?.code ?? "INTERNAL"
		const message = body.error?.message ?? "request failed"
		throw new MainApiError(code, response.status, message)
	}
	return body.data
}

const toSession = (data: SessionResponse, fallbackRefresh: string): BotSession => ({
	accessToken: data.accessToken,
	refreshToken: data.refreshToken ?? fallbackRefresh,
	expiresAt: Math.floor(Date.now() / 1000) + data.expiresIn,
	tenantId: data.tenantId,
	tenantType: data.tenantType,
	role: data.role,
	userId: data.userId,
})

const exchangeRefresh = async (refreshToken: string): Promise<BotSession> => {
	const response = await fetch(`${config.mainUrl}/v1/bot/session`, {
		method: "POST",
		headers: serviceHeaders(),
		body: JSON.stringify({ refreshToken }),
	})
	const data = await readEnvelope<SessionResponse>(response)
	return toSession(data, refreshToken)
}

const writeSession = async (chatId: number, session: BotSession): Promise<void> => {
	await redis.set(sessionKey(chatId), JSON.stringify(session), "EX", 30 * 24 * 60 * 60)
}

const writeTenantSession = async (tenantId: string, session: BotSession): Promise<void> => {
	await redis.set(tenantSessionKey(tenantId), JSON.stringify(session), "EX", 30 * 24 * 60 * 60)
}

const refreshSession = async (chatId: number, refreshToken: string): Promise<BotSession> => {
	const session = await exchangeRefresh(refreshToken)
	await writeSession(chatId, session)
	return session
}

const refreshTenantSession = async (
	tenantId: string,
	refreshToken: string,
): Promise<BotSession> => {
	const session = await exchangeRefresh(refreshToken)
	await writeTenantSession(tenantId, session)
	return session
}

export const getSession = async (chatId: number): Promise<BotSession | null> => {
	const raw = await redis.get(sessionKey(chatId))
	if (raw == null) return null
	const existing = JSON.parse(raw) as BotSession
	if (!isExpiringSoon(existing)) return existing
	return refreshSession(chatId, existing.refreshToken)
}

export const setSession = async (chatId: number, session: BotSession): Promise<void> => {
	await writeSession(chatId, session)
}

export const clearSession = async (chatId: number): Promise<void> => {
	await redis.del(sessionKey(chatId))
}

export const getTenantSession = async (tenantId: string): Promise<BotSession | null> => {
	const raw = await redis.get(tenantSessionKey(tenantId))
	if (raw == null) return null
	const session = JSON.parse(raw) as BotSession
	if (!isExpiringSoon(session)) return session
	return refreshTenantSession(tenantId, session.refreshToken)
}

export const setTenantSession = async (tenantId: string, session: BotSession): Promise<void> => {
	await writeTenantSession(tenantId, session)
}

export const clearTenantSession = async (tenantId: string): Promise<void> => {
	await redis.del(tenantSessionKey(tenantId))
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
	const data = await readEnvelope<{ refreshToken: string }>(response)
	return refreshSession(chatId, data.refreshToken)
}

export const unbindChat = async (chatId: number): Promise<void> => {
	await fetch(`${config.mainUrl}/v1/bot/bind/${chatId}`, {
		method: "DELETE",
		headers: serviceHeaders(),
	})
	await clearSession(chatId)
}

const userHeaders = (session: BotSession, idempotencyKey: string): Record<string, string> => {
	const headers: Record<string, string> = {
		authorization: `Bearer ${session.accessToken}`,
		"content-type": "application/json",
	}
	if (idempotencyKey !== "") headers["Idempotency-Key"] = idempotencyKey
	return headers
}

export type RequestOptions = {
	method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
	body?: unknown
	idempotencyKey?: string
}

const requireSession = async (chatId: number): Promise<BotSession> => {
	const session = await getSession(chatId)
	if (session == null) {
		throw new MainApiError("AUTH_TOKEN_EXPIRED", 401, "chat is not linked")
	}
	return session
}

const send = async (
	session: BotSession,
	path: string,
	options: RequestOptions,
): Promise<Response | null> =>
	fetch(`${config.mainUrl}${path}`, {
		method: options.method ?? "GET",
		headers: userHeaders(session, options.idempotencyKey ?? ""),
		body: options.body == null ? null : JSON.stringify(options.body),
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	}).catch((error: Error) => {
		logger.warn({ path, error: error.message }, "main call network error")
		return null
	})

export const callMain = async <T = unknown>(
	chatId: number,
	path: string,
	options: RequestOptions = {},
): Promise<T> => {
	const session = await requireSession(chatId)
	const response = await send(session, path, options)
	if (response == null) {
		throw new MainApiError("SERVICE_UNAVAILABLE", 503, "main service unreachable")
	}
	if (response.status !== 401) return readEnvelope<T>(response)

	const refreshed = await refreshSession(chatId, session.refreshToken)
	const retry = await send(refreshed, path, options)
	if (retry == null) {
		throw new MainApiError("SERVICE_UNAVAILABLE", 503, "main service unreachable")
	}
	return readEnvelope<T>(retry)
}

export const callMainBinary = async (chatId: number, path: string): Promise<Uint8Array> => {
	const session = await requireSession(chatId)
	const response = await fetch(`${config.mainUrl}${path}`, {
		headers: userHeaders(session, ""),
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	})
	if (!response.ok) {
		throw new MainApiError("INTERNAL", response.status, "report download failed")
	}
	return new Uint8Array(await response.arrayBuffer())
}
