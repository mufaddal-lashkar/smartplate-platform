import { Elysia } from "elysia"
import { ApiError } from "../../shared/api-error"
import { systemClock } from "../../shared/clock"
import { AUTH_ATTEMPT_RULE, clientAddress, enforceRateLimit } from "../../shared/rate-limit"
import {
	ACCESS_COOKIE,
	REFRESH_COOKIE,
	requireSession,
	sessionPlugin,
} from "../../shared/session.plugin"
import { loginSchema, registerSchema } from "./auth.schema"
import {
	ACCESS_TTL_SECONDS,
	type AuthResult,
	getMe,
	login,
	REFRESH_TTL_SECONDS,
	registerTenant,
	revokeRefresh,
	rotateRefresh,
} from "./auth.service"

type CookieOptions = {
	value: string
	httpOnly: boolean
	secure: boolean
	sameSite: string
	path: string
	maxAge: number
}

type CookieJar = Record<string, { set: (options: CookieOptions) => void }>

const setAuthCookies = (cookie: CookieJar, result: AuthResult) => {
	const base = { httpOnly: true, secure: true, sameSite: "lax", path: "/" }
	cookie[ACCESS_COOKIE]?.set({ ...base, value: result.accessToken, maxAge: ACCESS_TTL_SECONDS })
	cookie[REFRESH_COOKIE]?.set({ ...base, value: result.refreshToken, maxAge: REFRESH_TTL_SECONDS })
}

const clearAuthCookies = (cookie: CookieJar) => {
	const base = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 }
	cookie[ACCESS_COOKIE]?.set({ ...base, value: "" })
	cookie[REFRESH_COOKIE]?.set({ ...base, value: "" })
}

export const authRoute = new Elysia({ prefix: "/v1/auth" })
	.use(sessionPlugin)
	.post("/register", async ({ body, cookie, request }) => {
		await enforceRateLimit(AUTH_ATTEMPT_RULE, clientAddress(request), systemClock.now().valueOf())
		const input = registerSchema.parse(body)
		const result = await registerTenant(input, systemClock)
		setAuthCookies(cookie as CookieJar, result)
		return getMe(result.session)
	})
	.post("/login", async ({ body, cookie, request }) => {
		await enforceRateLimit(AUTH_ATTEMPT_RULE, clientAddress(request), systemClock.now().valueOf())
		const input = loginSchema.parse(body)
		const result = await login(input, systemClock)
		setAuthCookies(cookie as CookieJar, result)
		return getMe(result.session)
	})
	.post("/refresh", async ({ cookie }) => {
		const jar = cookie as CookieJar & Record<string, { value: string }>
		const token = jar[REFRESH_COOKIE]?.value ?? ""
		if (token === "") throw new ApiError("AUTH_TOKEN_EXPIRED", "Please sign in to continue.")

		const result = await rotateRefresh(token, systemClock)
		setAuthCookies(cookie as CookieJar, result)
		return getMe(result.session)
	})
	.post("/logout", async ({ cookie }) => {
		const jar = cookie as CookieJar & Record<string, { value: string }>
		const token = jar[REFRESH_COOKIE]?.value ?? ""
		if (token !== "") await revokeRefresh(token)
		clearAuthCookies(cookie as CookieJar)
		return { signedOut: true }
	})
	.get("/me", async ({ session }) => getMe(requireSession(session)))
