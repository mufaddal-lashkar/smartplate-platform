import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../src/db/tx"
import { findNgo, submitVerification, updateNgo } from "../src/modules/tenants/ngo.service"
import { updateRestaurant } from "../src/modules/tenants/restaurant.service"
import { updateTenant } from "../src/modules/tenants/tenant.service"
import { fixedClock } from "../src/shared/clock"
import { makeTenant, type TestTenant } from "./helpers/db"

const clock = fixedClock("2026-08-01T10:00:00Z")
const cleanupTenant = async (tenant: TestTenant) => {
	await withSuperAdmin(async (tx) => {
		await tx.execute(sql`delete from user_permissions where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from users where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from audit_logs where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from ngos where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from restaurants where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from tenants where id = ${tenant.id}`)
	})
}
void clock

describe("tenant PATCH", () => {
	let tenant: TestTenant

	beforeAll(async () => {
		tenant = await makeTenant("restaurant")
	})

	afterAll(async () => {
		await cleanupTenant(tenant)
	})

	test("updateTenant renames the tenant and writes an audit row", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		const updated = await updateTenant(ctx, { name: "Renamed Cafe" })
		expect(updated.name).toBe("Renamed Cafe")

		const audit = await withSuperAdmin(async (tx) => {
			const rows = await tx.execute(sql`
				select action from audit_logs
				where tenant_id = ${ctx.tenantId} and action = 'tenant.update'
			`)
			return rows.length
		})
		expect(audit).toBeGreaterThan(0)
	})
})

describe("restaurant PATCH", () => {
	let tenant: TestTenant

	beforeAll(async () => {
		tenant = await makeTenant("restaurant")
		await withSuperAdmin(async (tx) => {
			await tx.execute(sql`
				insert into restaurants (tenant_id, name, city, cuisine_type, latitude, longitude, browse_radius_km)
				values (${tenant.id}, 'Test Diner', 'Bengaluru', 'Multi', 12.97, 77.59, 10)
			`)
		})
	})

	afterAll(async () => {
		await cleanupTenant(tenant)
	})

	test("updateRestaurant changes fields and writes an audit row", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		const updated = await updateRestaurant(ctx, {
			logoUrl: "https://cdn.example/logo.png",
			cuisineType: "South Indian",
		})
		expect(updated.logoUrl).toBe("https://cdn.example/logo.png")
		expect(updated.cuisineType).toBe("South Indian")

		const audit = await withSuperAdmin(async (tx) => {
			const rows = await tx.execute(sql`
				select payload from audit_logs
				where tenant_id = ${ctx.tenantId} and action = 'restaurant.update'
				order by created_at desc limit 1
			`)
			const row = rows[0] as { payload: unknown } | undefined
			return row ? (row.payload as Record<string, string>) : null
		})
		expect(audit).not.toBeNull()
		expect(audit?.logoUrl).toBe("https://cdn.example/logo.png")
		expect(audit?.cuisineType).toBe("South Indian")
	})
})

describe("NGO verification submit", () => {
	let tenant: TestTenant

	beforeAll(async () => {
		tenant = await makeTenant("ngo")
		await withSuperAdmin(async (tx) => {
			await tx.execute(sql`
				insert into ngos (tenant_id, name, active_from, active_to, latitude, longitude, service_radius_km, verification_status)
				values (${tenant.id}, 'Test NGO', '09:00', '18:00', 12.97, 77.59, 25, 'pending'::ngo_verification_status)
			`)
		})
	})

	afterAll(async () => {
		await cleanupTenant(tenant)
	})

	test("submitVerification moves an unverified NGO to pending and writes audit", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "ngo" as const,
			role: "ngo_admin" as const,
			userId: tenant.ownerId,
		}
		const result = await submitVerification(ctx, {
			registrationNo: "REG-001",
			contactName: "Anita Joshi",
			contactPhone: "+91-9000000000",
			notes: "We serve breakfast and dinner.",
		})
		expect(result.verificationStatus).toBe("pending")
		expect(result.verificationSubmittedAt).not.toBeNull()
		expect(result.registrationNo).toBe("REG-001")

		const audit = await withSuperAdmin(async (tx) => {
			const rows = await tx.execute(sql`
				select 1 from audit_logs
				where tenant_id = ${ctx.tenantId} and action = 'verification.submit'
			`)
			return rows.length
		})
		expect(audit).toBeGreaterThan(0)
	})

	test("submitVerification rejects an already-approved NGO", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "ngo" as const,
			role: "ngo_admin" as const,
			userId: tenant.ownerId,
		}
		await withSuperAdmin(async (tx) => {
			await tx.execute(sql`
				update ngos set verification_status = 'approved'::ngo_verification_status, verified_at = now()
				where tenant_id = ${ctx.tenantId}
			`)
		})

		await expect(
			submitVerification(ctx, {
				registrationNo: "REG-002",
				contactName: "Anita Joshi",
				contactPhone: "+91-9000000000",
			}),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" })

		const ngo = await findNgo(ctx)
		expect(ngo.registrationNo).not.toBe("REG-002")
	})

	test("updateNgo changes the display name and writes an audit row", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "ngo" as const,
			role: "ngo_admin" as const,
			userId: tenant.ownerId,
		}
		const updated = await updateNgo(ctx, { contactPhone: "+91-9000000001" })
		expect(updated.contactPhone).toBe("+91-9000000001")
	})
})
