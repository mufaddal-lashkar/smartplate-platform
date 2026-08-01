import { Elysia } from "elysia"
import type { SessionContext } from "../db/tx"
import { ApiError } from "./api-error"
import { systemClock } from "./clock"
import { verifyAccessToken } from "./jwt"

export const ACCESS_COOKIE = "sp_access"
export const REFRESH_COOKIE = "sp_refresh"

const readCookie = (header: string, name: string): string => {
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=")
		if (key === name) return decodeURIComponent(rest.join("="))
	}
	return ""
}

export const resolveSession = async (cookieHeader: string): Promise<SessionContext | null> => {
	const token = readCookie(cookieHeader, ACCESS_COOKIE)
	if (token === "") return null

	const secret = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me"
	const claims = await verifyAccessToken(token, secret, systemClock.now().unix())
	if (claims == null) return null

	return {
		tenantId: claims.tenantId,
		tenantType: claims.tenantType,
		role: claims.role,
		userId: claims.sub,
	}
}

export const sessionPlugin = new Elysia({ name: "session" }).derive(
	{ as: "global" },
	async ({ request }) => {
		const session = await resolveSession(request.headers.get("cookie") ?? "")
		return { session }
	},
)

export const requireSession = (session: SessionContext | null): SessionContext => {
	if (session == null) {
		throw new ApiError("AUTH_TOKEN_EXPIRED", "Please sign in to continue.")
	}
	return session
}
