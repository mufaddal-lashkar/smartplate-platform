import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { userPermissions } from "../src/db/schema"
import { withSuperAdmin } from "../src/db/tx"
import { hasPermissionFor, hasPermissionForRole, requirePermission } from "../src/shared/rbac"
import { makeTenant } from "./helpers/db"

describe("rbac per-user overrides", () => {
	let tenant: { id: string; ownerId: string }

	beforeAll(async () => {
		tenant = await makeTenant("restaurant")
	})

	afterAll(async () => {
		await withSuperAdmin(async (tx) => {
			await tx.execute(sql`delete from user_permissions where tenant_id = ${tenant.id}`)
		})
	})

	test("role matrix denies staff disposition.decide by default", () => {
		expect(hasPermissionForRole("staff", "disposition.decide")).toBe(false)
	})

	test("requirePermission throws AUTH_FORBIDDEN when role lacks the perm", async () => {
		await expect(
			requirePermission(
				{ tenantId: tenant.id, tenantType: "restaurant", role: "staff", userId: tenant.ownerId },
				"disposition.decide",
			),
		).rejects.toMatchObject({ code: "AUTH_FORBIDDEN" })
	})

	test("per-user override grants a permission the role does not have", async () => {
		await withSuperAdmin(async (tx) => {
			await tx.insert(userPermissions).values({
				tenantId: tenant.id,
				userId: tenant.ownerId,
				permission: "disposition.decide",
				granted: true,
				updatedByUserId: null,
			})
		})

		const allowed = await hasPermissionFor(
			{ tenantId: tenant.id, tenantType: "restaurant", role: "staff", userId: tenant.ownerId },
			"disposition.decide",
		)
		expect(allowed).toBe(true)
	})

	test("per-user override revokes a permission the role has", async () => {
		await withSuperAdmin(async (tx) => {
			await tx.delete(userPermissions).where(sql`${userPermissions.userId} = ${tenant.ownerId}`)
			await tx.insert(userPermissions).values({
				tenantId: tenant.id,
				userId: tenant.ownerId,
				permission: "inventory.read",
				granted: false,
				updatedByUserId: null,
			})
		})

		const allowed = await hasPermissionFor(
			{ tenantId: tenant.id, tenantType: "restaurant", role: "owner", userId: tenant.ownerId },
			"inventory.read",
		)
		expect(allowed).toBe(false)
	})

	test("requirePermission succeeds when override grants the perm", async () => {
		await withSuperAdmin(async (tx) => {
			await tx.delete(userPermissions).where(sql`${userPermissions.userId} = ${tenant.ownerId}`)
			await tx.insert(userPermissions).values({
				tenantId: tenant.id,
				userId: tenant.ownerId,
				permission: "disposition.decide",
				granted: true,
				updatedByUserId: null,
			})
		})

		await expect(
			requirePermission(
				{ tenantId: tenant.id, tenantType: "restaurant", role: "staff", userId: tenant.ownerId },
				"disposition.decide",
			),
		).resolves.toBeUndefined()
	})

	test("verification.submit is a permission; ngo_admin has it, owner does not", () => {
		expect(hasPermissionForRole("ngo_admin", "verification.submit")).toBe(true)
		expect(hasPermissionForRole("owner", "verification.submit")).toBe(false)
	})

	test("ngo_admin can submit verification end-to-end via requirePermission", async () => {
		const ngo = await makeTenant("ngo")
		try {
			await expect(
				requirePermission(
					{ tenantId: ngo.id, tenantType: "ngo", role: "ngo_admin", userId: ngo.ownerId },
					"verification.submit",
				),
			).resolves.toBeUndefined()
		} finally {
			await withSuperAdmin(async (tx) => {
				await tx.execute(sql`delete from users where id = ${ngo.ownerId}`)
				await tx.execute(sql`delete from ngos where tenant_id = ${ngo.id}`)
				await tx.execute(sql`delete from tenants where id = ${ngo.id}`)
			})
		}
	})
})
