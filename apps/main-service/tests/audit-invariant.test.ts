import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { auditLogs } from "../src/db/schema"
import { type SessionContext, setSessionConfig, withSuperAdmin, withSystem } from "../src/db/tx"
import { decideVerification } from "../src/modules/admin/verify.service"
import { replaceMyPreferences } from "../src/modules/notifications/preferences.service"
import { submitVerification, updateNgo } from "../src/modules/tenants/ngo.service"
import { updateRestaurant } from "../src/modules/tenants/restaurant.service"
import { updateTenant } from "../src/modules/tenants/tenant.service"
import { setPermissionOverride } from "../src/modules/users/permissions.service"
import { archiveUser, inviteUser, updateUser } from "../src/modules/users/users.service"
import { fixedClock } from "../src/shared/clock"
import { makeTenant, type TestTenant } from "./helpers/db"

const clock = fixedClock("2026-08-01T10:00:00Z")
void clock

const cleanupTenant = async (tenant: TestTenant) => {
	await withSuperAdmin(async (tx) => {
		await tx.execute(sql`delete from audit_logs where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from notification_preferences where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from user_permissions where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from users where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from restaurants where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from ngos where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from tenants where id = ${tenant.id}`)
	})
}

const ownerContext = (tenant: TestTenant): SessionContext => ({
	tenantId: tenant.id,
	tenantType: "restaurant",
	role: "owner",
	userId: tenant.ownerId,
})

const ngoContext = (tenant: TestTenant): SessionContext => ({
	tenantId: tenant.id,
	tenantType: "ngo",
	role: "ngo_admin",
	userId: tenant.ownerId,
})

const seedNgo = async (tenant: TestTenant) => {
	await withSystem(async (tx) => {
		await setSessionConfig(tx, "app.tenant_id", tenant.id)
		await tx.execute(sql`
			insert into ngos (tenant_id, name, service_radius_km, active_from, active_to, latitude, longitude, verification_status)
			values (${tenant.id}, ${`NGO ${tenant.id.slice(0, 8)}`}, 25, '00:00', '23:59', 19.076, 72.8777, 'pending'::ngo_verification_status)
		`)
	})
}

const findAudit = async (tenantId: string, action: string) => {
	const rows = await withSuperAdmin(async (tx) =>
		tx.select().from(auditLogs).where(sql`${auditLogs.tenantId} = ${tenantId}`),
	)
	return rows.find((r) => r.action === action)
}

describe("audit invariant: every sensitive action writes one row", () => {
	const restaurant: { current?: TestTenant } = {}
	const ngo: { current?: TestTenant } = {}
	const superAdmin: { current?: string } = {}

	beforeAll(async () => {
		restaurant.current = await makeTenant("restaurant")
		await withSuperAdmin(async (tx) => {
			await tx.execute(sql`
				insert into restaurants (tenant_id, name, city, cuisine_type, latitude, longitude, browse_radius_km)
				values (${restaurant.current?.id}, 'Test Diner', 'Bengaluru', 'Multi', 12.97, 77.59, 10)
			`)
		})
		ngo.current = await makeTenant("ngo")
		await seedNgo(ngo.current)

		await withSystem(async (tx) => {
			const rows = await tx.execute(sql`
				insert into users (tenant_id, email, password_hash, name, role)
				values (null, ${`super-${crypto.randomUUID().slice(0, 8)}@test.local`}, '', 'Super', 'super_admin')
				returning id
			`)
			superAdmin.current = String((rows[0] as Record<string, unknown>).id)
		})
	})

	afterAll(async () => {
		if (restaurant.current) await cleanupTenant(restaurant.current)
		if (ngo.current) await cleanupTenant(ngo.current)
		if (superAdmin.current) {
			await withSuperAdmin(async (tx) => {
				await tx.execute(sql`delete from users where id = ${superAdmin.current}`)
			})
		}
	})

	test("tenant.update writes an audit row", async () => {
		const r = restaurant.current as TestTenant
		await updateTenant(ownerContext(r), { name: "New Name" })
		const row = await findAudit(r.id, "tenant.update")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("tenant")
	})

	test("restaurant.update writes an audit row", async () => {
		const r = restaurant.current as TestTenant
		await updateRestaurant(ownerContext(r), { name: "Renamed" })
		const row = await findAudit(r.id, "restaurant.update")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("restaurant")
	})

	test("users.invite writes an audit row", async () => {
		const r = restaurant.current as TestTenant
		await inviteUser(ownerContext(r), {
			email: `audit-${crypto.randomUUID().slice(0, 8)}@test.local`,
			name: "Audit User",
			role: "staff",
		})
		const row = await findAudit(r.id, "users.invite")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("users")
	})

	test("users.update writes an audit row", async () => {
		const r = restaurant.current as TestTenant
		const ctx = ownerContext(r)
		const created = await inviteUser(ctx, {
			email: `audit-update-${crypto.randomUUID().slice(0, 8)}@test.local`,
			name: "To Update",
			role: "staff",
		})
		await updateUser(ctx, created.id, { name: "Updated" })
		const row = await findAudit(r.id, "users.update")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("users")
	})

	test("users.archive writes an audit row", async () => {
		const r = restaurant.current as TestTenant
		const ctx = ownerContext(r)
		const created = await inviteUser(ctx, {
			email: `audit-arch-${crypto.randomUUID().slice(0, 8)}@test.local`,
			name: "To Archive",
			role: "staff",
		})
		await archiveUser(ctx, created.id, { archived: true })
		const row = await findAudit(r.id, "users.archive")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("users")
	})

	test("permissions.set writes an audit row", async () => {
		const r = restaurant.current as TestTenant
		await setPermissionOverride(ownerContext(r), r.ownerId, "disposition.decide", true)
		const row = await findAudit(r.id, "permissions.set")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("user_permissions")
	})

	test("ngo.update writes an audit row", async () => {
		const n = ngo.current as TestTenant
		await updateNgo(ngoContext(n), { name: "Audit NGO" })
		const row = await findAudit(n.id, "ngo.update")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("ngo")
	})

	test("verification.submit writes an audit row", async () => {
		const n = ngo.current as TestTenant
		await submitVerification(ngoContext(n), {
			registrationNo: "AUDIT-001",
			contactName: "Audit Person",
			contactPhone: "9999999999",
		})
		const row = await findAudit(n.id, "verification.submit")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("ngo")
	})

	test("notification.preferences.updated writes an audit row", async () => {
		const r = restaurant.current as TestTenant
		await replaceMyPreferences(ownerContext(r), {
			preferences: [
				{
					topic: "marketplace.new_listing",
					radiusKm: 5,
					activeFrom: "00:00",
					activeTo: "23:59",
					quietHoursEnabled: false,
				},
			],
		})
		const row = await findAudit(r.id, "notification.preferences.updated")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("notification_preferences")
	})

	test("ngo.verify.approved writes an audit row under the NGO tenant", async () => {
		const n = ngo.current as TestTenant
		await decideVerification(
			{
				tenantId: "00000000-0000-0000-0000-000000000000",
				tenantType: "restaurant",
				role: "super_admin",
				userId: superAdmin.current as string,
			},
			n.id,
			{ decision: "approve" },
		)
		const row = await findAudit(n.id, "ngo.verify.approved")
		expect(row).toBeDefined()
		expect(row?.entityType).toBe("ngo")
		expect(row?.actorId).toBe(superAdmin.current)
	})

	test("the audit row count for the restaurant tenant is positive", async () => {
		const r = restaurant.current as TestTenant
		const total = await withSuperAdmin(async (tx) =>
			tx
				.select({ n: sql<number>`count(*)::int` })
				.from(auditLogs)
				.where(sql`${auditLogs.tenantId} = ${r.id}`),
		)
		expect(total[0]?.n).toBeGreaterThan(0)
	})
})
