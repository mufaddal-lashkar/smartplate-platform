import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../src/db/tx"
import { ApiError } from "../src/shared/api-error"
import { fixedClock } from "../src/shared/clock"
import { makeTenant, type TestTenant } from "./helpers/db"

const clock = fixedClock("2026-08-01T10:00:00Z")
void clock

import {
	getPreferencesForUser,
	listMyPreferences,
	replaceMyPreferences,
} from "../src/modules/notifications/preferences.service"

const ownerContext = (tenant: TestTenant) => ({
	tenantId: tenant.id,
	tenantType: "restaurant" as const,
	role: "owner" as const,
	userId: tenant.ownerId,
})

const cleanupTenant = async (tenant: TestTenant) => {
	await withSuperAdmin(async (tx) => {
		await tx.execute(sql`delete from notification_preferences where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from audit_logs where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from user_permissions where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from users where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from restaurants where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from ngos where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from tenants where id = ${tenant.id}`)
	})
}

describe("notification preferences", () => {
	let tenant: TestTenant

	beforeAll(async () => {
		tenant = await makeTenant("restaurant")
	})

	afterAll(async () => {
		await cleanupTenant(tenant)
	})

	test("listMyPreferences returns [] for a new user", async () => {
		const rows = await listMyPreferences(ownerContext(tenant))
		expect(rows).toEqual([])
	})

	test("replaceMyPreferences upserts and replaces; list returns sorted", async () => {
		const ctx = ownerContext(tenant)
		const rows = await replaceMyPreferences(ctx, {
			preferences: [
				{
					topic: "marketplace.new_listing",
					radiusKm: 10.5,
					activeFrom: "08:00",
					activeTo: "20:00",
					quietHoursEnabled: true,
				},
				{
					topic: "leftover.expiring",
					radiusKm: null,
					activeFrom: "00:00",
					activeTo: "23:59",
					quietHoursEnabled: false,
				},
			],
		})
		expect(rows).toHaveLength(2)
		expect(rows[0]?.topic).toBe("leftover.expiring")
		expect(rows[1]?.topic).toBe("marketplace.new_listing")
	})

	test("replaceMyPreferences is idempotent for the same topic", async () => {
		const ctx = ownerContext(tenant)
		const first = await replaceMyPreferences(ctx, {
			preferences: [
				{
					topic: "marketplace.new_listing",
					radiusKm: 5,
					activeFrom: "09:00",
					activeTo: "18:00",
					quietHoursEnabled: false,
				},
			],
		})
		expect(first).toHaveLength(1)
		expect(first[0]?.radiusKm).toBe("5.00")
	})

	test("replaceMyPreferences rejects duplicate topics in payload", async () => {
		const ctx = ownerContext(tenant)
		await expect(
			replaceMyPreferences(ctx, {
				preferences: [
					{
						topic: "marketplace.new_listing",
						radiusKm: 1,
						activeFrom: "00:00",
						activeTo: "23:59",
						quietHoursEnabled: false,
					},
					{
						topic: "marketplace.new_listing",
						radiusKm: 2,
						activeFrom: "00:00",
						activeTo: "23:59",
						quietHoursEnabled: false,
					},
				],
			}),
		).rejects.toBeInstanceOf(ApiError)
	})

	test("getPreferencesForUser returns a numeric radiusKm", async () => {
		const ctx = ownerContext(tenant)
		await replaceMyPreferences(ctx, {
			preferences: [
				{
					topic: "public.topic",
					radiusKm: 12.34,
					activeFrom: "00:00",
					activeTo: "23:59",
					quietHoursEnabled: true,
				},
			],
		})
		const out = await getPreferencesForUser(ctx.userId, "public.topic")
		expect(out).not.toBeNull()
		expect(out?.radiusKm).toBe(12.34)
		expect(out?.quietHoursEnabled).toBe(true)
	})

	test("getPreferencesForUser returns null for missing topic", async () => {
		const out = await getPreferencesForUser(tenant.ownerId, "missing.topic")
		expect(out).toBeNull()
	})
})
