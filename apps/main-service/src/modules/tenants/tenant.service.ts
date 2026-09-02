import { sql } from "drizzle-orm"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { writeAuditLog } from "../../shared/audit"
import { findTenantInCtx, type TenantRow } from "./tenant.queries"
import type { UpdateTenantInput } from "./tenant.schema"

const toTenantRow = (row: Record<string, unknown>): TenantRow => ({
	id: String(row.id),
	type: String(row.type),
	name: String(row.name),
	status: String(row.status),
	createdAt: new Date(String(row.created_at)),
})

export const updateTenant = async (
	ctx: SessionContext,
	input: UpdateTenantInput,
): Promise<TenantRow> => {
	const before = await findTenantInCtx(ctx)
	if (before == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Tenant not found.")
	}

	const result = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			update tenants
			set name = coalesce(${input.name ?? null}, name)
			where id = ${ctx.tenantId}
			returning id, type, name, status, created_at
		`)
		return rows[0] ? toTenantRow(rows[0] as Record<string, unknown>) : null
	})

	if (result == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Tenant not found.")
	}

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: "tenant.update",
			entityType: "tenant",
			entityId: result.id,
			payload: { beforeName: before.name, afterName: result.name },
		},
	)

	return result
}

export const findTenant = async (ctx: SessionContext): Promise<TenantRow> => {
	const tenant = await findTenantInCtx(ctx)
	if (tenant == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "Tenant not found.")
	}
	return tenant
}
