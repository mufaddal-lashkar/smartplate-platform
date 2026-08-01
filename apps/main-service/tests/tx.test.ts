import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { db } from "../src/db/client"
import { withSystem, withTenant } from "../src/db/tx"
import { makeTenant } from "./helpers/db"

describe("transaction wrapper", () => {
	test("sets app.tenant_id for the duration of the transaction", async () => {
		const tenant = await makeTenant("restaurant")

		const seen = await withTenant(
			{ tenantId: tenant.id, tenantType: "restaurant", role: "owner", userId: tenant.ownerId },
			async (tx) => {
				const rows = await tx.execute(sql`select current_setting('app.tenant_id', true) as v`)
				return rows[0]?.v
			},
		)

		expect(seen).toBe(tenant.id)
	})

	test("context does not leak to the next query on the same pool", async () => {
		const tenant = await makeTenant("restaurant")

		await withTenant(
			{ tenantId: tenant.id, tenantType: "restaurant", role: "owner", userId: tenant.ownerId },
			async () => undefined,
		)

		const rows = await db.execute(sql`select current_setting('app.tenant_id', true) as v`)
		const leaked = rows[0]?.v
		expect(leaked == null || leaked === "").toBe(true)
	})

	test("withSystem reads users but cannot see domain tables", async () => {
		const visibleUsers = await withSystem(async (tx) => {
			const rows = await tx.execute(sql`select count(*)::int as c from users`)
			return Number(rows[0]?.c)
		})
		expect(visibleUsers).toBeGreaterThan(0)

		const tenant = await makeTenant("restaurant")
		await withTenant(
			{ tenantId: tenant.id, tenantType: "restaurant", role: "owner", userId: tenant.ownerId },
			async (tx) =>
				tx.execute(sql`insert into notifications (tenant_id, type) values (${tenant.id}, 'probe')`),
		)

		const visibleNotifications = await withSystem(async (tx) => {
			const rows = await tx.execute(sql`select count(*)::int as c from notifications`)
			return Number(rows[0]?.c)
		})
		expect(visibleNotifications).toBe(0)
	})
})
