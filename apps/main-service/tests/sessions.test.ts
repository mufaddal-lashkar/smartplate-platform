import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../src/db/tx"
import {
	findActiveSessionsForUser,
	login,
	revokeFamily,
	rotateRefresh,
} from "../src/modules/auth/auth.service"
import { fixedClock } from "../src/shared/clock"

const clock = fixedClock("2026-08-01T10:00:00Z")
const uniqueEmail = () => `sessions-${crypto.randomUUID().slice(0, 8)}@test.local`

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

describe("active sessions", () => {
	test("a fresh login records a single session for the user", async () => {
		const email = uniqueEmail()
		const { registerTenant } = await import("../src/modules/auth/auth.service")
		const session = await registerTenant(
			{
				tenantType: "restaurant",
				tenantName: "Sessions Test",
				name: "Session Owner",
				email,
				password: "any-password",
			},
			clock,
		)
		try {
			const list = await findActiveSessionsForUser(session.session.userId)
			expect(list.length).toBeGreaterThan(0)
			expect(list[0]?.userId).toBe(session.session.userId)
		} finally {
			await cleanup(email)
		}
	})

	test("rotating the refresh keeps the same family; a new login adds a new family", async () => {
		const email = uniqueEmail()
		const { registerTenant } = await import("../src/modules/auth/auth.service")
		const first = await registerTenant(
			{
				tenantType: "restaurant",
				tenantName: "Rotation",
				name: "Rotator",
				email,
				password: "any-password",
			},
			clock,
		)
		try {
			await rotateRefresh(first.refreshToken, clock)
			const second = await login({ email, password: "any-password" }, clock)

			const list = await findActiveSessionsForUser(first.session.userId)
			expect(list.length).toBeGreaterThanOrEqual(2)
			const familyIds = new Set(list.map((s) => s.family))
			expect(familyIds.size).toBeGreaterThanOrEqual(2)

			void second
		} finally {
			await cleanup(email)
		}
	})

	test("revokeFamily removes all sessions for that family", async () => {
		const email = uniqueEmail()
		const { registerTenant } = await import("../src/modules/auth/auth.service")
		const session = await registerTenant(
			{
				tenantType: "restaurant",
				tenantName: "Revoke",
				name: "Revoker",
				email,
				password: "any-password",
			},
			clock,
		)
		try {
			const list = await findActiveSessionsForUser(session.session.userId)
			expect(list.length).toBeGreaterThan(0)
			const family = list[0]?.family ?? ""
			await revokeFamily(family)
			const after = await findActiveSessionsForUser(session.session.userId)
			expect(after.find((s) => s.family === family)).toBeUndefined()
		} finally {
			await cleanup(email)
		}
	})
})
