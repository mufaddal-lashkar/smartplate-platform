import { sql } from "drizzle-orm"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { writeAuditLog } from "../../shared/audit"
import { PERMISSIONS, type Permission } from "../../shared/rbac"
import {
	findOverride,
	listOverridesForUser,
	type PermissionOverrideRow,
} from "./permissions.queries"
import { findUserByIdInTenant } from "./users.queries"

const isPermission = (value: string): value is Permission =>
	(PERMISSIONS as readonly string[]).includes(value)

export const listPermissionOverrides = async (
	ctx: SessionContext,
	userId: string,
): Promise<PermissionOverrideRow[]> => {
	const user = await findUserByIdInTenant(ctx, userId)
	if (user == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "User not found.")
	}
	return listOverridesForUser(ctx, userId)
}

export const setPermissionOverride = async (
	ctx: SessionContext,
	userId: string,
	permission: string,
	granted: boolean,
): Promise<PermissionOverrideRow> => {
	if (!isPermission(permission)) {
		throw new ApiError("VALIDATION_ERROR", "Unknown permission.", [
			{ field: "permission", code: "VALIDATION_ERROR", message: "Unknown permission" },
		])
	}
	const user = await findUserByIdInTenant(ctx, userId)
	if (user == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "User not found.")
	}

	const result = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into user_permissions (tenant_id, user_id, permission, granted, updated_by_user_id)
			values (
				${ctx.tenantId},
				${userId},
				${permission},
				${granted},
				${ctx.userId}
			)
			on conflict (tenant_id, user_id, permission) do update
			set granted = excluded.granted,
			    updated_by_user_id = excluded.updated_by_user_id
			returning id, tenant_id, user_id, permission, granted, updated_by_user_id, updated_at
		`)
		return rows[0] as PermissionOverrideRow
	})

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: "permissions.set",
			entityType: "user_permissions",
			entityId: `${userId}:${permission}`,
			payload: { userId, permission, granted },
		},
	)

	return result
}

export const removePermissionOverride = async (
	ctx: SessionContext,
	userId: string,
	permission: string,
): Promise<void> => {
	if (!isPermission(permission)) {
		throw new ApiError("VALIDATION_ERROR", "Unknown permission.", [
			{ field: "permission", code: "VALIDATION_ERROR", message: "Unknown permission" },
		])
	}
	const user = await findUserByIdInTenant(ctx, userId)
	if (user == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "User not found.")
	}

	const existing = await findOverride(ctx, userId, permission)
	if (existing == null) {
		return
	}

	await withTenant(ctx, async (tx) => {
		await tx.execute(sql`
			delete from user_permissions
			where user_id = ${userId} and permission = ${permission}
		`)
	})

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: "permissions.unset",
			entityType: "user_permissions",
			entityId: `${userId}:${permission}`,
			payload: { userId, permission },
		},
	)
}
