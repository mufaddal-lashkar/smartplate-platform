import type {
	ForgotPasswordInput,
	LoginInput,
	MeResponse,
	RegisterInput,
	ResetPasswordInput,
} from "@smartplate/contracts/auth"
import { sql } from "drizzle-orm"
import { db } from "../../db/client"
import type { Role } from "../../db/schema"
import { applySessionContext, type SessionContext, setSessionConfig } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import type { Clock } from "../../shared/clock"
import { signAccessToken } from "../../shared/jwt"
import { enforceRateLimit, REFRESH_RULE } from "../../shared/rate-limit"
import { permissionsForRole } from "../../shared/rbac"
import { redis } from "../../shared/redis"
import {
	findProfileName,
	findTenantById,
	findTenantVerified,
	findUserByEmail,
	findUserById,
} from "./auth.queries"

export const ACCESS_TTL_SECONDS = 15 * 60
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
export const RESET_TTL_SECONDS = 60 * 60

export type AuthResult = {
	accessToken: string
	refreshToken: string
	session: SessionContext
}

const jwtSecret = () => process.env.JWT_SECRET ?? "dev-jwt-secret-change-me"

const hashToken = async (token: string): Promise<string> => {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

const refreshKey = (hash: string) => `refresh:${hash}`
const familyKey = (family: string) => `refresh-family:${family}`

const issueTokens = async (
	session: SessionContext,
	family: string,
	clock: Clock,
): Promise<AuthResult> => {
	const nowSeconds = clock.now().unix()

	const accessToken = await signAccessToken(
		{
			sub: session.userId,
			tenantId: session.tenantId,
			tenantType: session.tenantType,
			role: session.role,
			exp: nowSeconds + ACCESS_TTL_SECONDS,
		},
		jwtSecret(),
	)

	const refreshToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
	const hash = await hashToken(refreshToken)

	await redis.set(
		refreshKey(hash),
		JSON.stringify({ ...session, family, issuedAt: nowSeconds }),
		"EX",
		REFRESH_TTL_SECONDS,
	)
	await redis.sadd(familyKey(family), hash)
	await redis.expire(familyKey(family), REFRESH_TTL_SECONDS)
	await trackSessionForUser(session.userId, family)

	return { accessToken, refreshToken, session }
}

const EMAIL_TAKEN = new ApiError("VALIDATION_FAILED", "That email is already registered.", [
	{ field: "email", code: "EMAIL_TAKEN", message: "That email is already registered." },
])

const UNIQUE_VIOLATION = "23505"

const isUniqueViolation = (error: Error): boolean =>
	(error as Error & { code: string }).code === UNIQUE_VIOLATION

export const registerTenant = async (input: RegisterInput, clock: Clock): Promise<AuthResult> => {
	const existing = await findUserByEmail(input.email)
	if (existing != null) throw EMAIL_TAKEN

	const passwordHash = await Bun.password.hash(input.password)
	const role: Role = input.tenantType === "restaurant" ? "owner" : "ngo_admin"
	const createdAt = clock.now().toISOString()

	const session = await db
		.transaction(async (tx) => {
			await setSessionConfig(tx, "app.role", "system")

			const created = await tx.execute(sql`
			with t as (
				insert into tenants (type, name, created_at)
				values (${input.tenantType}, ${input.tenantName}, ${createdAt})
				returning id
			), u as (
				insert into users (tenant_id, email, password_hash, name, role, created_at)
				select t.id, ${input.email}, ${passwordHash}, ${input.name}, ${role}::user_role, ${createdAt}
				from t
				returning id, tenant_id
			)
			select u.id as user_id, u.tenant_id as tenant_id from u
		`)

			const next: SessionContext = {
				tenantId: String(created[0]?.tenant_id),
				tenantType: input.tenantType,
				role,
				userId: String(created[0]?.user_id),
			}

			await applySessionContext(tx, next)

			if (input.tenantType === "restaurant") {
				await tx.execute(sql`
				insert into restaurants (tenant_id, name, created_at)
				values (${next.tenantId}, ${input.tenantName}, ${createdAt})
			`)
			} else {
				await tx.execute(sql`
				insert into ngos (tenant_id, name, created_at)
				values (${next.tenantId}, ${input.tenantName}, ${createdAt})
			`)
			}

			return next
		})
		.catch((error: Error) => {
			if (isUniqueViolation(error)) throw EMAIL_TAKEN
			throw error
		})

	return issueTokens(session, crypto.randomUUID(), clock)
}

export const login = async (input: LoginInput, clock: Clock): Promise<AuthResult> => {
	const user = await findUserByEmail(input.email)
	const invalid = new ApiError("AUTH_INVALID_CREDENTIALS", "Email or password is incorrect.")

	if (user == null) throw invalid
	if (user.passwordHash === "") throw invalid

	const matches = await Bun.password.verify(input.password, user.passwordHash)
	if (!matches) throw invalid

	if (user.tenantId == null) {
		if (user.role !== "super_admin") throw invalid
		return issueTokens(
			{
				tenantId: "00000000-0000-0000-0000-000000000000",
				tenantType: "restaurant",
				role: "super_admin",
				userId: user.id,
			},
			crypto.randomUUID(),
			clock,
		)
	}

	const tenant = await findTenantById(user.tenantId)
	if (tenant == null) throw invalid

	return issueTokens(
		{
			tenantId: tenant.id,
			tenantType: tenant.type,
			role: user.role,
			userId: user.id,
		},
		crypto.randomUUID(),
		clock,
	)
}

export const rotateRefresh = async (token: string, clock: Clock): Promise<AuthResult> => {
	const hash = await hashToken(token)
	const stored = await redis.get(refreshKey(hash))

	if (stored == null) {
		throw new ApiError("AUTH_REFRESH_REUSED", "Your session has expired. Please sign in again.")
	}

	const parsed = JSON.parse(stored) as SessionContext & { family: string }

	await enforceRateLimit(REFRESH_RULE, parsed.family, clock.now().valueOf())

	await redis.del(refreshKey(hash))
	await redis.srem(familyKey(parsed.family), hash)
	await untrackSessionForUser(parsed.userId, parsed.family)

	const session: SessionContext = {
		tenantId: parsed.tenantId,
		tenantType: parsed.tenantType,
		role: parsed.role,
		userId: parsed.userId,
	}

	return issueTokens(session, parsed.family, clock)
}

export const revokeRefresh = async (token: string) => {
	const hash = await hashToken(token)
	const stored = await redis.get(refreshKey(hash))
	if (stored == null) return

	const parsed = JSON.parse(stored) as { family: string }
	const members = await redis.smembers(familyKey(parsed.family))

	if (members.length > 0) await redis.del(...members.map(refreshKey))
	await redis.del(familyKey(parsed.family))
}

export const revokeFamily = async (family: string) => {
	const members = await redis.smembers(familyKey(family))
	if (members.length > 0) await redis.del(...members.map(refreshKey))
	await redis.del(familyKey(family))
}

const resetKey = (hash: string) => `password-reset:${hash}`

export type PasswordResetResult =
	| { ok: true; token: string }
	| { ok: false; reason: "no_user" | "email_not_configured" }

export const requestPasswordReset = async (
	input: ForgotPasswordInput,
	clock: Clock,
): Promise<PasswordResetResult> => {
	const user = await findUserByEmail(input.email)
	if (user == null) return { ok: false, reason: "no_user" }

	if (process.env.SMTP_URL === undefined || process.env.SMTP_URL === "") {
		return { ok: false, reason: "email_not_configured" }
	}

	const rawToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
	const hash = await hashToken(rawToken)

	const record = {
		userId: user.id,
		issuedAt: clock.now().toISOString(),
	}

	await redis.set(resetKey(hash), JSON.stringify(record), "EX", RESET_TTL_SECONDS)

	return { ok: true, token: rawToken }
}

const refreshUserIndexKey = (userId: string) => `refresh-by-user:${userId}`

const trackSessionForUser = async (userId: string, family: string) => {
	await redis.sadd(refreshUserIndexKey(userId), family)
	await redis.expire(refreshUserIndexKey(userId), REFRESH_TTL_SECONDS)
}

const untrackSessionForUser = async (userId: string, family: string) => {
	await redis.srem(refreshUserIndexKey(userId), family)
}

const findFamiliesForUser = async (userId: string): Promise<string[]> => {
	return redis.smembers(refreshUserIndexKey(userId))
}

const findSessionDetail = async (hash: string) => {
	const stored = await redis.get(refreshKey(hash))
	if (stored == null) return null
	return JSON.parse(stored) as SessionContext & { family: string; issuedAt: number }
}

export type ActiveSession = {
	family: string
	hash: string
	userId: string
	tenantId: string
	tenantType: string
	role: string
	issuedAt: number
}

export const findActiveSessionsForUser = async (userId: string): Promise<ActiveSession[]> => {
	const families = await findFamiliesForUser(userId)
	const sessions: ActiveSession[] = []

	for (const family of families) {
		const memberHashes = await redis.smembers(familyKey(family))
		for (const hash of memberHashes) {
			const detail = await findSessionDetail(hash)
			if (detail == null) continue
			sessions.push({
				family,
				hash,
				userId: detail.userId,
				tenantId: detail.tenantId,
				tenantType: detail.tenantType,
				role: detail.role,
				issuedAt: detail.issuedAt,
			})
		}
	}

	return sessions
}

export const completePasswordReset = async (
	input: ResetPasswordInput,
	clock: Clock,
): Promise<void> => {
	const hash = await hashToken(input.token)
	const stored = await redis.get(resetKey(hash))
	if (stored == null) {
		throw new ApiError("AUTH_TOKEN_EXPIRED", "That reset link has expired or already been used.")
	}

	const parsed = JSON.parse(stored) as { userId: string; issuedAt: string }
	void clock

	const newHash = await Bun.password.hash(input.newPassword)

	const updated = await db.transaction(async (tx) => {
		await setSessionConfig(tx, "app.role", "system")
		const rows = await tx.execute(sql`
				update users
				set password_hash = ${newHash}
				where id = ${parsed.userId}
				returning id
			`)
		return rows.length > 0
	})

	if (!updated) {
		await redis.del(resetKey(hash))
		throw new ApiError("RESOURCE_NOT_FOUND", "Account no longer exists.")
	}

	const families = await findFamiliesForUser(parsed.userId)
	for (const family of families) {
		await revokeFamily(family)
	}
	await redis.del(refreshUserIndexKey(parsed.userId))

	await redis.del(resetKey(hash))
}

export const getMe = async (ctx: SessionContext): Promise<MeResponse> => {
	const user = await findUserById(ctx.userId)
	const tenant = await findTenantById(ctx.tenantId)

	if (user == null || tenant == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Session no longer valid.")
	}

	const profileName = await findProfileName(ctx)
	const verified = await findTenantVerified(ctx)

	return {
		user: { id: user.id, name: user.name, email: user.email, role: user.role },
		tenant: {
			id: tenant.id,
			name: profileName === "" ? tenant.name : profileName,
			type: tenant.type,
			verified,
		},
		permissions: permissionsForRole(user.role),
	}
}
