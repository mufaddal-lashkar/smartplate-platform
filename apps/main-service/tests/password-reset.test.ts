import { afterAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../src/db/tx"
import {
	completePasswordReset,
	login,
	requestPasswordReset,
	rotateRefresh,
} from "../src/modules/auth/auth.service"
import { fixedClock } from "../src/shared/clock"
import { redis } from "../src/shared/redis"

const clock = fixedClock("2026-08-01T10:00:00Z")
const uniqueEmail = () => `reset-${crypto.randomUUID().slice(0, 8)}@test.local`

const cleanup = async (email: string) => {
	await withSuperAdmin(async (tx) => {
		await tx.execute(
			sql`delete from restaurants where tenant_id in (select tenant_id from users where email = ${email})`,
		)
		await tx.execute(
			sql`delete from tenants where id in (select tenant_id from users where email = ${email})`,
		)
		await tx.execute(sql`delete from users where email = ${email}`)
	})
}

const registerTestUser = async (
	email: string,
	password: string,
	clock: ReturnType<typeof fixedClock>,
) => {
	const { registerTenant } = await import("../src/modules/auth/auth.service")
	return registerTenant(
		{
			tenantType: "restaurant",
			tenantName: `Tenant ${email.slice(0, 8)}`,
			name: "Tester",
			email,
			password,
		},
		clock,
	)
}

describe("password reset", () => {
	test("forgot returns no_user when the email is unknown", async () => {
		const result = await requestPasswordReset({ email: "nobody-nowhere@x.test" }, clock)
		expect(result).toEqual({ ok: false, reason: "no_user" })
	})

	test("forgot returns email_not_configured when SMTP_URL is unset", async () => {
		const previous = process.env.SMTP_URL
		delete process.env.SMTP_URL
		try {
			const email = uniqueEmail()
			await registerTestUser(email, "any-password", clock)
			try {
				const result = await requestPasswordReset({ email }, clock)
				expect(result).toEqual({ ok: false, reason: "email_not_configured" })
			} finally {
				await cleanup(email)
			}
		} finally {
			if (previous != null) process.env.SMTP_URL = previous
		}
	})

	test("forgot returns a token when SMTP_URL is set and the user exists", async () => {
		const previous = process.env.SMTP_URL
		process.env.SMTP_URL = "smtp://localhost:1025"
		try {
			const email = uniqueEmail()
			await registerTestUser(email, "any-password", clock)
			try {
				const result = await requestPasswordReset({ email }, clock)
				expect(result.ok).toBe(true)
				if (result.ok) {
					expect(result.token.length).toBeGreaterThan(20)
				}
			} finally {
				await cleanup(email)
			}
		} finally {
			if (previous == null) delete process.env.SMTP_URL
			else process.env.SMTP_URL = previous
		}
	})

	test("completePasswordReset consumes the token and changes the password", async () => {
		const previous = process.env.SMTP_URL
		process.env.SMTP_URL = "smtp://localhost:1025"
		try {
			const email = uniqueEmail()
			await registerTestUser(email, "old-password", clock)
			try {
				const requested = await requestPasswordReset({ email }, clock)
				expect(requested.ok).toBe(true)
				if (!requested.ok) return

				await completePasswordReset({ token: requested.token, newPassword: "new-password" }, clock)

				await expect(login({ email, password: "old-password" }, clock)).rejects.toMatchObject({
					code: "AUTH_INVALID_CREDENTIALS",
				})
				const result = await login({ email, password: "new-password" }, clock)
				expect(result.session.role).toBe("owner")
			} finally {
				await cleanup(email)
			}
		} finally {
			if (previous == null) delete process.env.SMTP_URL
			else process.env.SMTP_URL = previous
		}
	})

	test("completePasswordReset rejects a token that was never issued", async () => {
		await expect(
			completePasswordReset(
				{ token: `${crypto.randomUUID()}.${crypto.randomUUID()}`, newPassword: "x" },
				clock,
			),
		).rejects.toMatchObject({ code: "AUTH_TOKEN_EXPIRED" })
	})

	test("completePasswordReset is single-use; a second attempt fails", async () => {
		const previous = process.env.SMTP_URL
		process.env.SMTP_URL = "smtp://localhost:1025"
		try {
			const email = uniqueEmail()
			await registerTestUser(email, "old-password", clock)
			try {
				const requested = await requestPasswordReset({ email }, clock)
				if (!requested.ok) throw new Error("forgot did not issue a token")
				await completePasswordReset({ token: requested.token, newPassword: "new-password" }, clock)
				await expect(
					completePasswordReset({ token: requested.token, newPassword: "another-password" }, clock),
				).rejects.toMatchObject({ code: "AUTH_TOKEN_EXPIRED" })
			} finally {
				await cleanup(email)
			}
		} finally {
			if (previous == null) delete process.env.SMTP_URL
			else process.env.SMTP_URL = previous
		}
	})

	test("completing a reset revokes all active refresh families for the user", async () => {
		const previous = process.env.SMTP_URL
		process.env.SMTP_URL = "smtp://localhost:1025"
		try {
			const email = uniqueEmail()
			const session = await registerTestUser(email, "old-password", clock)
			const oldRefresh = session.refreshToken
			try {
				const requested = await requestPasswordReset({ email }, clock)
				if (!requested.ok) throw new Error("forgot did not issue a token")
				await completePasswordReset({ token: requested.token, newPassword: "new-password" }, clock)

				await expect(rotateRefresh(oldRefresh, clock)).rejects.toMatchObject({
					code: "AUTH_REFRESH_REUSED",
				})
			} finally {
				await cleanup(email)
			}
		} finally {
			if (previous == null) delete process.env.SMTP_URL
			else process.env.SMTP_URL = previous
		}
	})
})

describe("super_admin login", () => {
	test("a super_admin without a tenant can log in", async () => {
		const previous = process.env.SMTP_URL
		delete process.env.SMTP_URL
		try {
			const email = uniqueEmail()
			await withSuperAdmin(async (tx) => {
				await tx.execute(sql`
					insert into users (tenant_id, email, password_hash, name, role)
					values (null, ${email}, ${await Bun.password.hash("admin-pass")}, 'Super', 'super_admin')
				`)
			})
			try {
				const result = await login({ email, password: "admin-pass" }, clock)
				expect(result.session.role).toBe("super_admin")
			} finally {
				await cleanup(email)
			}
		} finally {
			if (previous != null) process.env.SMTP_URL = previous
		}
	})

	test("a user with an empty password hash cannot log in even with the right email", async () => {
		const previous = process.env.SMTP_URL
		delete process.env.SMTP_URL
		try {
			const email = uniqueEmail()
			await withSuperAdmin(async (tx) => {
				await tx.execute(sql`
					insert into users (tenant_id, email, password_hash, name, role)
					values (null, ${email}, '', 'No Password', 'super_admin')
				`)
			})
			try {
				await expect(login({ email, password: "" }, clock)).rejects.toMatchObject({
					code: "AUTH_INVALID_CREDENTIALS",
				})
			} finally {
				await cleanup(email)
			}
		} finally {
			if (previous != null) process.env.SMTP_URL = previous
		}
	})
})

afterAll(async () => {
	await redis.quit()
})
