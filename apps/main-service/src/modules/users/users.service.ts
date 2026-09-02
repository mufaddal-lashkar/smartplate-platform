import { sql } from "drizzle-orm"
import { type SessionContext, withSystem, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { writeAuditLog } from "../../shared/audit"
import { findUserByEmail } from "../auth/auth.queries"
import { findUserByIdInTenant, listUsersInTenant, type UserRow } from "./users.queries"
import type { ArchiveUserInput, InviteUserInput, UpdateUserInput } from "./users.schema"

const toUserRow = (row: Record<string, unknown>): UserRow => ({
	id: String(row.id),
	email: String(row.email),
	name: String(row.name),
	role: String(row.role),
	tenantId: row.tenant_id == null ? null : String(row.tenant_id),
	invitedByUserId: row.invited_by_user_id == null ? null : String(row.invited_by_user_id),
	archivedAt: row.archived_at == null ? null : new Date(String(row.archived_at)),
	createdAt: new Date(String(row.created_at)),
})

export const inviteUser = async (ctx: SessionContext, input: InviteUserInput): Promise<UserRow> => {
	const existing = await findUserByEmail(input.email)
	if (existing != null) {
		throw new ApiError("EMAIL_TAKEN", "That email is already registered.", [
			{ field: "email", code: "EMAIL_TAKEN", message: "That email is already registered." },
		])
	}

	const result = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into users (tenant_id, email, password_hash, name, role, invited_by_user_id)
			values (
				${ctx.tenantId},
				${input.email},
				${""},
				${input.name},
				${input.role}::user_role,
				${ctx.userId}
			)
			returning id, email, name, role, tenant_id, invited_by_user_id, archived_at, created_at
		`)
		return toUserRow(rows[0] as Record<string, unknown>)
	})

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: "users.invite",
			entityType: "users",
			entityId: result.id,
			payload: { email: input.email, role: input.role },
		},
	)

	return result
}

export const updateUser = async (
	ctx: SessionContext,
	userId: string,
	input: UpdateUserInput,
): Promise<UserRow> => {
	const before = await findUserByIdInTenant(ctx, userId)
	if (before == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "User not found.")
	}

	if (userId === ctx.userId && input.role != null && input.role !== before.role) {
		throw new ApiError("VALIDATION_ERROR", "You cannot change your own role.", [
			{ field: "role", code: "VALIDATION_ERROR", message: "Self role change is not allowed" },
		])
	}

	const result = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			update users
			set
				name = coalesce(${input.name ?? null}, name),
				role = coalesce(${input.role ?? null}::user_role, role)
			where id = ${userId} and tenant_id = ${ctx.tenantId}
			returning id, email, name, role, tenant_id, invited_by_user_id, archived_at, created_at
		`)
		return rows[0] ? toUserRow(rows[0] as Record<string, unknown>) : null
	})

	if (result == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "User not found.")
	}

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: "users.update",
			entityType: "users",
			entityId: userId,
			payload: {
				beforeName: before.name,
				afterName: result.name,
				beforeRole: before.role,
				afterRole: result.role,
			},
		},
	)

	return result
}

export const archiveUser = async (
	ctx: SessionContext,
	userId: string,
	input: ArchiveUserInput,
): Promise<UserRow> => {
	if (userId === ctx.userId && input.archived) {
		throw new ApiError("VALIDATION_ERROR", "You cannot archive yourself.", [
			{ field: "archived", code: "VALIDATION_ERROR", message: "Self archive is not allowed" },
		])
	}

	const before = await findUserByIdInTenant(ctx, userId)
	if (before == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "User not found.")
	}

	const result = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			update users
			set archived_at = ${input.archived ? new Date().toISOString() : null}
			where id = ${userId} and tenant_id = ${ctx.tenantId}
			returning id, email, name, role, tenant_id, invited_by_user_id, archived_at, created_at
		`)
		return rows[0] ? toUserRow(rows[0] as Record<string, unknown>) : null
	})

	if (result == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "User not found.")
	}

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: input.archived ? "users.archive" : "users.unarchive",
			entityType: "users",
			entityId: userId,
			payload: {},
		},
	)

	return result
}

export const listUsers = async (ctx: SessionContext): Promise<UserRow[]> => listUsersInTenant(ctx)

export const findUserInTenant = async (ctx: SessionContext, userId: string): Promise<UserRow> => {
	const user = await findUserByIdInTenant(ctx, userId)
	if (user == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "User not found.")
	}
	return user
}

export const makeUserInTenant = async (input: {
	tenantId: string
	email: string
	name: string
	role: string
	invitedByUserId: string | null
	passwordHash: string
}): Promise<UserRow> =>
	withSystem(async (tx) => {
		const rows = await tx.execute(sql`
			insert into users (tenant_id, email, password_hash, name, role, invited_by_user_id)
			values (
				${input.tenantId},
				${input.email},
				${input.passwordHash},
				${input.name},
				${input.role}::user_role,
				${input.invitedByUserId}
			)
			returning id, email, name, role, tenant_id, invited_by_user_id, archived_at, created_at
		`)
		return toUserRow(rows[0] as Record<string, unknown>)
	})
