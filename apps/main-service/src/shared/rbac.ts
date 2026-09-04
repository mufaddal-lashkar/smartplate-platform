import { and, eq } from "drizzle-orm"
import type { Role, TenantType } from "../db/schema"
import { userPermissions } from "../db/schema"
import { type SessionContext, withTenant } from "../db/tx"
import { ApiError } from "./api-error"

export const PERMISSIONS = [
	"inventory.read",
	"inventory.write",
	"prep.write",
	"leftover.write",
	"disposition.decide",
	"listing.price",
	"listing.claim",
	"listing.complete",
	"reports.read",
	"users.manage",
	"settings.write",
	"ngo.verify",
	"verification.submit",
	"platform.analytics",
] as const

export type Permission = (typeof PERMISSIONS)[number]

const MATRIX: Record<Role, Permission[]> = {
	super_admin: [
		"inventory.read",
		"inventory.write",
		"prep.write",
		"leftover.write",
		"reports.read",
		"users.manage",
		"settings.write",
		"ngo.verify",
		"verification.submit",
		"platform.analytics",
	],
	owner: [
		"inventory.read",
		"inventory.write",
		"prep.write",
		"leftover.write",
		"disposition.decide",
		"listing.price",
		"listing.claim",
		"listing.complete",
		"reports.read",
		"users.manage",
		"settings.write",
	],
	staff: [
		"inventory.read",
		"inventory.write",
		"prep.write",
		"leftover.write",
		"listing.complete",
		"reports.read",
	],
	ngo_admin: [
		"listing.claim",
		"listing.complete",
		"reports.read",
		"users.manage",
		"settings.write",
		"verification.submit",
	],
	ngo_volunteer: ["listing.complete"],
}

export const hasPermissionForRole = (role: Role, permission: Permission): boolean =>
	MATRIX[role].includes(permission)

export const hasPermission = hasPermissionForRole

export const permissionsForRole = (role: Role): Permission[] => MATRIX[role]

export const hasPermissionFor = async (
	session: SessionContext,
	permission: Permission,
): Promise<boolean> => {
	const override = await withTenant(session, async (tx) => {
		const rows = await tx
			.select({ granted: userPermissions.granted })
			.from(userPermissions)
			.where(
				and(eq(userPermissions.userId, session.userId), eq(userPermissions.permission, permission)),
			)
			.limit(1)
		return rows[0]?.granted ?? null
	})

	if (override === true) return true
	if (override === false) return false
	return hasPermissionForRole(session.role, permission)
}

export const requirePermission = async (
	session: SessionContext,
	permission: Permission,
): Promise<void> => {
	const allowed = await hasPermissionFor(session, permission)
	if (!allowed) {
		throw new ApiError("AUTH_FORBIDDEN", "You do not have permission to do that.")
	}
}

export const requireTenantType = (session: SessionContext, expected: TenantType): void => {
	if (session.tenantType !== expected) {
		throw new ApiError("TENANT_TYPE_MISMATCH", "This action is not available for your account.")
	}
}

const READ_ONLY_PATHS: ReadonlySet<string> = new Set<string>([
	"/v1/dishes",
	"/v1/ingredients",
	"/v1/leftovers",
	"/v1/leftovers/",
	"/v1/listings",
	"/v1/sessions",
	"/v1/sessions/",
	"/v1/inventory/stock",
])

export const isReadOnlyPath = (path: string): boolean => {
	const clean = (path.split("?")[0] ?? path).replace(/\/+$/, "")
	const normalised = clean === "" ? "/" : clean
	return READ_ONLY_PATHS.has(clean) || READ_ONLY_PATHS.has(normalised)
}
