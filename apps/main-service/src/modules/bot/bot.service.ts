import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "../../db/client"
import { botUserLinks, tenants, users } from "../../db/schema"
import { setSessionConfig, withSystem } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { systemClock } from "../../shared/clock"
import { signAccessToken } from "../../shared/jwt"
import { redis } from "../../shared/redis"
import type { BindInput, StartSessionInput } from "./bot.schema"

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
const ACCESS_TTL_SECONDS = 15 * 60

const jwtSecret = () => process.env.JWT_SECRET ?? "dev-jwt-secret-change-me"

const hashToken = async (token: string): Promise<string> => {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

const tenantCode = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")

const resolveTenantByCode = async (code: string) =>
	withSystem(async (tx) => {
		const rows = await tx
			.select({ id: tenants.id, name: tenants.name, type: tenants.type })
			.from(tenants)
			.where(eq(tenants.status, "active"))
		for (const row of rows) {
			if (tenantCode(row.name) === code.toLowerCase()) return row
		}
		return null
	})

const resolveTenantMembership = async (tenantId: string, email: string) =>
	withSystem(async (tx) => {
		const rows = await tx.execute(sql`
			select id, tenant_id, email, name, role, password_hash
			from users
			where tenant_id = ${tenantId} and email = ${email}
			limit 1
		`)
		return rows[0] as {
			id: string
			tenant_id: string
			email: string
			name: string
			role: string
			password_hash: string
		} | null
	})

export type BindResult = {
	chatId: number
	tenantId: string
	tenantType: "restaurant" | "ngo"
	tenantName: string
	userId: string
	role: string
	refreshToken: string
	refreshExpiresIn: number
}

export const bindChat = async (input: BindInput): Promise<BindResult> => {
	const tenant = await resolveTenantByCode(input.tenantCode)
	if (tenant == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "I couldn't find that tenant code.")
	}
	const member = await resolveTenantMembership(tenant.id, input.email)
	if (member == null) {
		throw new ApiError("AUTH_INVALID_CREDENTIALS", "That email isn't a member of this tenant.")
	}

	const refreshToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`
	const refreshHash = await hashToken(refreshToken)

	await db.transaction(async (tx) => {
		await setSessionConfig(tx, "app.role", "system")
		await setSessionConfig(tx, "app.tenant_id", tenant.id)
		await tx.execute(sql`delete from bot_user_links where user_id = ${member.id}::uuid`)
		await tx.insert(botUserLinks).values({
			userId: member.id,
			tenantId: tenant.id,
			refreshTokenHash: refreshHash,
			chatId: input.chatId,
		})
		await tx.execute(sql`
			insert into telegram_chats (chat_id, user_id, tenant_id, linked_at, last_seen_at)
			values (${input.chatId}, ${member.id}::uuid, ${tenant.id}, now(), now())
			on conflict (chat_id) do update set
				user_id = excluded.user_id,
				tenant_id = excluded.tenant_id,
				last_seen_at = now()
		`)
	})

	return {
		chatId: input.chatId,
		tenantId: tenant.id,
		tenantType: tenant.type,
		tenantName: tenant.name,
		userId: member.id,
		role: member.role,
		refreshToken,
		refreshExpiresIn: REFRESH_TTL_SECONDS,
	}
}

export type SessionResult = {
	accessToken: string
	refreshToken: string
	expiresIn: number
	tenantId: string
	tenantType: "restaurant" | "ngo"
	role: string
	userId: string
}

const sessionResponseSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().min(1),
	expires_in: z.number().int().positive(),
	tenant_id: z.string().uuid(),
	tenant_type: z.enum(["restaurant", "ngo"]),
	role: z.string().min(1),
	user_id: z.string().uuid(),
})

const issueAccessForLink = async (
	userId: string,
	tenantId: string,
	tenantType: "restaurant" | "ngo",
	role: string,
): Promise<{ accessToken: string; expiresIn: number }> => {
	const now = systemClock.now().unix()
	const accessToken = await signAccessToken(
		{
			sub: userId,
			tenantId,
			tenantType,
			role: z.enum(["super_admin", "owner", "staff", "ngo_admin", "ngo_volunteer"]).parse(role),
			exp: now + ACCESS_TTL_SECONDS,
		},
		jwtSecret(),
	)
	return { accessToken, expiresIn: ACCESS_TTL_SECONDS }
}

export const startSession = async (
	_refresh: string,
	input: StartSessionInput,
): Promise<SessionResult> => {
	const hash = await hashToken(input.refreshToken)
	const linkKey = `bot:link:${hash}`

	const cached = await redis.get(linkKey)
	if (cached != null) {
		const parsed = sessionResponseSchema.parse(JSON.parse(cached))
		return {
			accessToken: parsed.access_token,
			refreshToken: input.refreshToken,
			expiresIn: parsed.expires_in,
			tenantId: parsed.tenant_id,
			tenantType: parsed.tenant_type,
			role: parsed.role,
			userId: parsed.user_id,
		}
	}

	const link = await withSystem(async (tx) => {
		const rows = await tx
			.select({
				id: botUserLinks.id,
				userId: botUserLinks.userId,
				tenantId: botUserLinks.tenantId,
			})
			.from(botUserLinks)
			.where(eq(botUserLinks.refreshTokenHash, hash))
			.limit(1)
		return rows[0] ?? null
	})

	if (link == null) {
		throw new ApiError(
			"AUTH_TOKEN_EXPIRED",
			"This binding is no longer valid. Re-link with /start.",
		)
	}

	const { user, tenant } = await withSystem(async (tx) => {
		const userRows = await tx
			.select({ id: users.id, role: users.role, name: users.name })
			.from(users)
			.where(eq(users.id, link.userId))
			.limit(1)
		const tenantRows = await tx
			.select({ id: tenants.id, type: tenants.type })
			.from(tenants)
			.where(eq(tenants.id, link.tenantId))
			.limit(1)
		return { user: userRows[0] ?? null, tenant: tenantRows[0] ?? null }
	})

	if (user == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "The user for this binding no longer exists.")
	}

	if (tenant == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "The tenant for this binding no longer exists.")
	}

	const { accessToken, expiresIn } = await issueAccessForLink(
		user.id,
		tenant.id,
		tenant.type,
		user.role,
	)

	await withSystem(async (tx) => {
		await tx
			.update(botUserLinks)
			.set({ lastUsedAt: systemClock.now().toDate() })
			.where(eq(botUserLinks.id, link.id))
	})

	const result: SessionResult = {
		accessToken,
		refreshToken: input.refreshToken,
		expiresIn,
		tenantId: tenant.id,
		tenantType: tenant.type,
		role: user.role,
		userId: user.id,
	}

	await redis.set(
		linkKey,
		JSON.stringify({
			access_token: accessToken,
			refresh_token: input.refreshToken,
			expires_in: expiresIn,
			tenant_id: tenant.id,
			tenant_type: tenant.type,
			role: user.role,
			user_id: user.id,
		}),
		"EX",
		REFRESH_TTL_SECONDS,
	)

	return result
}

export const unbindChat = async (chatId: number): Promise<void> => {
	await db.transaction(async (tx) => {
		await setSessionConfig(tx, "app.role", "system")
		await tx.execute(sql`delete from telegram_chats where chat_id = ${chatId}`)
		await tx.execute(sql`delete from bot_user_links where chat_id = ${chatId}`)
	})
}
