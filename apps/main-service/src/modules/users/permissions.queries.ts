import { and, asc, eq } from "drizzle-orm"
import { userPermissions } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"

export type PermissionOverrideRow = {
	id: string
	tenantId: string
	userId: string
	permission: string
	granted: boolean
	updatedByUserId: string | null
	updatedAt: Date
}

export const listOverridesForUser = async (
	ctx: SessionContext,
	userId: string,
): Promise<PermissionOverrideRow[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(userPermissions)
			.where(eq(userPermissions.userId, userId))
			.orderBy(asc(userPermissions.permission))
		return rows as PermissionOverrideRow[]
	})

export const findOverride = async (
	ctx: SessionContext,
	userId: string,
	permission: string,
): Promise<PermissionOverrideRow | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(userPermissions)
			.where(and(eq(userPermissions.userId, userId), eq(userPermissions.permission, permission)))
			.limit(1)
		return (rows[0] as PermissionOverrideRow | undefined) ?? null
	})
