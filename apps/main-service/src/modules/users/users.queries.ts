import { and, asc, eq, isNull } from "drizzle-orm"
import { users } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"

export type UserRow = {
	id: string
	email: string
	name: string
	role: string
	tenantId: string | null
	invitedByUserId: string | null
	archivedAt: Date | null
	createdAt: Date
}

export const listUsersInTenant = async (ctx: SessionContext): Promise<UserRow[]> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(users)
			.where(and(eq(users.tenantId, ctx.tenantId), isNull(users.archivedAt)))
			.orderBy(asc(users.createdAt))
		return rows as UserRow[]
	})

export const findUserByIdInTenant = async (
	ctx: SessionContext,
	userId: string,
): Promise<UserRow | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(users)
			.where(and(eq(users.id, userId), eq(users.tenantId, ctx.tenantId)))
			.limit(1)
		return (rows[0] as UserRow | undefined) ?? null
	})

export const findUserByEmailInTenant = async (
	ctx: SessionContext,
	email: string,
): Promise<UserRow | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.select()
			.from(users)
			.where(and(eq(users.tenantId, ctx.tenantId), eq(users.email, email)))
			.limit(1)
		return (rows[0] as UserRow | undefined) ?? null
	})
