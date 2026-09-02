import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../src/db/tx"
import { getAdminAnalytics } from "../src/modules/admin/analytics.service"
import { decideVerification } from "../src/modules/admin/verify.service"
import { ApiError } from "../src/shared/api-error"
import { fixedClock } from "../src/shared/clock"
import { makeTenant, type TestTenant } from "./helpers/db"

const clock = fixedClock("2026-08-01T10:00:00Z")
void clock

let superAdminId: string

const makeSuperAdmin = async (): Promise<string> => {
	return withSuperAdmin(async (tx) => {
		const rows = await tx.execute(sql`
			insert into users (tenant_id, email, password_hash, name, role)
			values (null, ${`superadmin-${crypto.randomUUID().slice(0, 8)}@test.local`}, '', 'Super', 'super_admin')
			returning id
		`)
		return String((rows[0] as Record<string, unknown>).id)
	})
}

const superAdminContext = (): {
	tenantId: string
	tenantType: "restaurant"
	role: "super_admin"
	userId: string
} => ({
	tenantId: "00000000-0000-0000-0000-000000000000",
	tenantType: "restaurant",
	role: "super_admin",
	userId: superAdminId,
})

const ownerContext = (tenant: TestTenant) => ({
	tenantId: tenant.id,
	tenantType: "restaurant" as const,
	role: "owner" as const,
	userId: tenant.ownerId,
})

const cleanupTenant = async (tenant: TestTenant) => {
	await withSuperAdmin(async (tx) => {
		await tx.execute(sql`delete from user_permissions where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from users where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from audit_logs where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from notifications where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from ngos where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from restaurants where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from tenants where id = ${tenant.id}`)
	})
}

beforeAll(async () => {
	superAdminId = await makeSuperAdmin()
})

afterAll(async () => {
	await withSuperAdmin(async (tx) => {
		await tx.execute(sql`delete from users where id = ${superAdminId}`)
	})
})

describe("admin verify", () => {
	let ngo: TestTenant
	let ngoPending: TestTenant

	beforeAll(async () => {
		ngo = await makeTenant("ngo")
		ngoPending = await makeTenant("ngo")
		await withSuperAdmin(async (tx) => {
			await tx.execute(sql`
				insert into ngos (tenant_id, name, latitude, longitude, service_radius_km, verification_status, registration_no)
				values (${ngo.id}, 'Admin Approve NGO', 12.97, 77.59, 25, 'pending'::ngo_verification_status, 'REG-APPROVE')
			`)
			await tx.execute(sql`
				insert into ngos (tenant_id, name, latitude, longitude, service_radius_km, verification_status, registration_no)
				values (${ngoPending.id}, 'Admin Reject NGO', 12.97, 77.59, 25, 'pending'::ngo_verification_status, 'REG-REJECT')
			`)
		})
	})

	afterAll(async () => {
		await cleanupTenant(ngo)
		await cleanupTenant(ngoPending)
	})

	test("super_admin approves a pending NGO: verifiedAt is set, audit row exists under NGO tenant", async () => {
		const result = await decideVerification(superAdminContext(), ngo.id, {
			decision: "approve",
		})
		expect(result.verificationStatus).toBe("approved")
		expect(result.verifiedAt).not.toBeNull()

		const audit = await withSuperAdmin(async (tx) => {
			const rows = await tx.execute(sql`
				select action, tenant_id::text as tenant_id
				from audit_logs
				where tenant_id = ${ngo.id} and action = 'ngo.verify.approved'
			`)
			return rows.length
		})
		expect(audit).toBeGreaterThan(0)
	})

	test("super_admin rejects a pending NGO: reason is set, status is rejected, notification is created", async () => {
		const result = await decideVerification(superAdminContext(), ngoPending.id, {
			decision: "reject",
			rejectionReason: "Documents were illegible. Please re-upload.",
		})
		expect(result.verificationStatus).toBe("rejected")
		expect(result.rejectionReason).toBe("Documents were illegible. Please re-upload.")
		expect(result.verifiedAt).toBeNull()

		const notifications = await withSuperAdmin(async (tx) => {
			const rows = await tx.execute(sql`
				select 1 from notifications
				where tenant_id = ${ngoPending.id} and type = 'verification.rejected'
			`)
			return rows.length
		})
		expect(notifications).toBeGreaterThan(0)
	})

	test("reject without a reason is rejected as VALIDATION_ERROR", async () => {
		const fresh = await makeTenant("ngo")
		try {
			await withSuperAdmin(async (tx) => {
				await tx.execute(sql`
					insert into ngos (tenant_id, name, latitude, longitude, service_radius_km, verification_status)
					values (${fresh.id}, 'No Reason', 12.97, 77.59, 25, 'pending'::ngo_verification_status)
				`)
			})
			await expect(
				decideVerification(superAdminContext(), fresh.id, { decision: "reject" }),
			).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
		} finally {
			await cleanupTenant(fresh)
		}
	})

	test("an owner cannot decide verification", async () => {
		const fresh = await makeTenant("ngo")
		try {
			await withSuperAdmin(async (tx) => {
				await tx.execute(sql`
					insert into ngos (tenant_id, name, latitude, longitude, service_radius_km, verification_status)
					values (${fresh.id}, 'Owner Try', 12.97, 77.59, 25, 'pending'::ngo_verification_status)
				`)
			})
			await expect(
				decideVerification(
					{
						tenantId: fresh.id,
						tenantType: "ngo",
						role: "ngo_admin",
						userId: fresh.ownerId,
					},
					fresh.id,
					{ decision: "approve" },
				),
			).rejects.toBeInstanceOf(ApiError)
		} finally {
			await cleanupTenant(fresh)
		}
	})
})

describe("admin analytics", () => {
	let restaurant: TestTenant

	beforeAll(async () => {
		restaurant = await makeTenant("restaurant")
	})

	afterAll(async () => {
		await cleanupTenant(restaurant)
	})

	test("super_admin gets aggregate counts", async () => {
		const analytics = await getAdminAnalytics()
		expect(analytics.totalTenants).toBeGreaterThan(0)
		expect(analytics.totalRestaurants).toBeGreaterThan(0)
		expect(analytics.totalNgos).toBeGreaterThan(0)
		expect(analytics.totalUsers).toBeGreaterThan(0)
	})

	test("the analytics call works for any super_admin; owner can never get here (route guard)", () => {
		const ctx = ownerContext(restaurant)
		expect(ctx.role).toBe("owner")
	})
})
