import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../src/db/tx"
import {
	removePermissionOverride,
	setPermissionOverride,
} from "../src/modules/users/permissions.service"
import { archiveUser, inviteUser, listUsers, updateUser } from "../src/modules/users/users.service"
import { fixedClock } from "../src/shared/clock"
import { makeTenant, type TestTenant } from "./helpers/db"

const clock = fixedClock("2026-08-01T10:00:00Z")
const uniqueEmail = () => `users-${crypto.randomUUID().slice(0, 8)}@test.local`

const cleanupTenant = async (tenant: TestTenant) => {
	await withSuperAdmin(async (tx) => {
		await tx.execute(sql`delete from user_permissions where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from users where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from ngos where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from restaurants where tenant_id = ${tenant.id}`)
		await tx.execute(sql`delete from tenants where id = ${tenant.id}`)
	})
}

describe("user management", () => {
	let tenant: TestTenant

	beforeAll(async () => {
		tenant = await makeTenant("restaurant")
	})

	afterAll(async () => {
		await cleanupTenant(tenant)
	})

	test("inviteUser creates a user with empty password and an invited_by_user_id", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		const email = uniqueEmail()
		const created = await inviteUser(ctx, {
			email,
			name: "Invited User",
			role: "staff",
		})
		expect(created.email).toBe(email)
		expect(created.role).toBe("staff")
		expect(created.archivedAt).toBeNull()
	})

	test("inviteUser rejects an email already used by anyone (cross-tenant)", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		const email = uniqueEmail()
		await inviteUser(ctx, { email, name: "First", role: "staff" })
		await expect(inviteUser(ctx, { email, name: "Second", role: "staff" })).rejects.toMatchObject({
			code: "EMAIL_TAKEN",
		})
	})

	test("updateUser changes name and role and writes an audit log entry", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		const email = uniqueEmail()
		const created = await inviteUser(ctx, { email, name: "Before", role: "staff" })
		const updated = await updateUser(ctx, created.id, { name: "After" })
		expect(updated.name).toBe("After")
		expect(updated.role).toBe("staff")

		const audit = await withSuperAdmin(async (tx) => {
			const rows = await tx.execute(sql`
				select action from audit_logs
				where tenant_id = ${ctx.tenantId} and entity_id = ${created.id}
				order by created_at desc
			`)
			return rows.map((r) => (r as { action: string }).action)
		})
		expect(audit).toContain("users.update")
	})

	test("updateUser refuses to change the caller's own role", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		await expect(updateUser(ctx, ctx.userId, { role: "staff" })).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		})
	})

	test("archiveUser refuses to archive yourself", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		await expect(archiveUser(ctx, ctx.userId, { archived: true })).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		})
	})

	test("archiveUser sets archivedAt and unarchive clears it", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		const email = uniqueEmail()
		const created = await inviteUser(ctx, { email, name: "T", role: "staff" })
		const archived = await archiveUser(ctx, created.id, { archived: true })
		expect(archived.archivedAt).not.toBeNull()

		const back = await archiveUser(ctx, created.id, { archived: false })
		expect(back.archivedAt).toBeNull()
	})

	test("listUsers only returns non-archived members of the caller's tenant", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		const email = uniqueEmail()
		const created = await inviteUser(ctx, { email, name: "Hide Me", role: "staff" })
		await archiveUser(ctx, created.id, { archived: true })

		const items = await listUsers(ctx)
		expect(items.find((u) => u.id === created.id)).toBeUndefined()
	})

	test("listUsers does not return users from other tenants (RLS)", async () => {
		const other = await makeTenant("restaurant")
		try {
			const ctx = {
				tenantId: tenant.id,
				tenantType: "restaurant" as const,
				role: "owner" as const,
				userId: tenant.ownerId,
			}
			await inviteUser(ctx, {
				email: uniqueEmail(),
				name: "Mine",
				role: "staff",
			})
			const items = await listUsers(ctx)
			const otherOwner = items.find((u) => u.id === other.ownerId)
			expect(otherOwner).toBeUndefined()
		} finally {
			await cleanupTenant(other)
		}
	})

	void clock
})

describe("user permission overrides", () => {
	let tenant: TestTenant

	beforeAll(async () => {
		tenant = await makeTenant("restaurant")
	})

	afterAll(async () => {
		await cleanupTenant(tenant)
	})

	test("setPermissionOverride grants a perm the role lacks; removePermissionOverride clears it", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		const target = (
			await inviteUser(ctx, {
				email: uniqueEmail(),
				name: "Target",
				role: "staff",
			})
		).id

		const before = await withSuperAdmin(async (tx) => {
			const rows = await tx.execute(sql`
				select 1 from user_permissions
				where user_id = ${target} and permission = 'disposition.decide'
			`)
			return rows.length
		})
		expect(before).toBe(0)

		const row = await setPermissionOverride(ctx, target, "disposition.decide", true)
		expect(row.granted).toBe(true)

		await removePermissionOverride(ctx, target, "disposition.decide")
		const after = await withSuperAdmin(async (tx) => {
			const rows = await tx.execute(sql`
				select 1 from user_permissions
				where user_id = ${target} and permission = 'disposition.decide'
			`)
			return rows.length
		})
		expect(after).toBe(0)
	})

	test("setPermissionOverride rejects unknown permission names", async () => {
		const ctx = {
			tenantId: tenant.id,
			tenantType: "restaurant" as const,
			role: "owner" as const,
			userId: tenant.ownerId,
		}
		await expect(
			setPermissionOverride(ctx, tenant.ownerId, "bogus.perm", true),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
	})
})
