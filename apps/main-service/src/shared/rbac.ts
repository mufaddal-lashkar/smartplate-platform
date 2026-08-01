import type { Role, TenantType } from "../db/schema"
import type { SessionContext } from "../db/tx"
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
	],
	ngo_volunteer: ["listing.complete"],
}

export const hasPermission = (role: Role, permission: Permission): boolean =>
	MATRIX[role].includes(permission)

export const permissionsForRole = (role: Role): Permission[] => MATRIX[role]

export const requirePermission = (session: SessionContext, permission: Permission): void => {
	if (!hasPermission(session.role, permission)) {
		throw new ApiError("AUTH_FORBIDDEN", "You do not have permission to do that.")
	}
}

export const requireTenantType = (session: SessionContext, expected: TenantType): void => {
	if (session.tenantType !== expected) {
		throw new ApiError("TENANT_TYPE_MISMATCH", "This action is not available for your account.")
	}
}
