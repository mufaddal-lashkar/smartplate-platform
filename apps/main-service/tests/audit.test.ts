import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { auditLogs } from "../src/db/schema"
import { withSuperAdmin, withTenant } from "../src/db/tx"
import { writeAuditLog, writeAuditLogFor } from "../src/shared/audit"
import { makeTenant } from "./helpers/db"

describe("audit log helper", () => {
	let tenant: { id: string; ownerId: string }

	beforeAll(async () => {
		tenant = await makeTenant("restaurant")
	})

	afterAll(async () => {
		await withSuperAdmin(async (tx) => {
			await tx.execute(sql`delete from audit_logs where tenant_id = ${tenant.id}`)
		})
	})

	test("writeAuditLog persists a row in the tenant's audit trail", async () => {
		await writeAuditLog(
			{ tenantId: tenant.id },
			{
				actorId: tenant.ownerId,
				action: "tenant.profile.update",
				entityType: "tenants",
				entityId: tenant.id,
				payload: { field: "name", before: "Old", after: "New" },
			},
		)

		const rows = await withTenant(
			{ tenantId: tenant.id, tenantType: "restaurant", role: "owner", userId: tenant.ownerId },
			async (tx) => {
				return tx.select().from(auditLogs).where(sql`${auditLogs.entityId} = ${tenant.id}`)
			},
		)

		const match = rows.find((r) => r.action === "tenant.profile.update")
		expect(match).toBeDefined()
		expect(match?.actorId).toBe(tenant.ownerId)
		expect(match?.entityType).toBe("tenants")
		expect(match?.payload).toEqual({ field: "name", before: "Old", after: "New" })
	})

	test("writeAuditLog refuses to write without a tenant", async () => {
		await expect(
			writeAuditLog(
				{ tenantId: "" },
				{
					actorId: null,
					action: "system.startup",
					entityType: "system",
					entityId: "boot",
					payload: { reason: "init" },
				},
			),
		).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
	})

	test("writeAuditLogFor inserts inside a caller-provided transaction", async () => {
		const result = await withTenant(
			{ tenantId: tenant.id, tenantType: "restaurant", role: "owner", userId: tenant.ownerId },
			async (tx) => {
				await writeAuditLogFor(tx, tenant.id, {
					actorId: tenant.ownerId,
					action: "users.invite",
					entityType: "users",
					entityId: "new-user-uuid",
					payload: { email: "x@y.z" },
				})
				return tx.select().from(auditLogs).where(sql`${auditLogs.action} = 'users.invite'`)
			},
		)

		expect(result.length).toBeGreaterThan(0)
		expect(result[0]?.entityId).toBe("new-user-uuid")
		expect(result[0]?.payload).toEqual({ email: "x@y.z" })
	})
})
