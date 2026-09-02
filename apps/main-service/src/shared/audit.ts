import { auditLogs } from "../db/schema"
import { type SessionContext, type Tx, withSuperAdmin } from "../db/tx"
import { ApiError } from "./api-error"

export type AuditPayload = Record<string, string | number | boolean | null>

export type AuditEntry = {
	actorId: string | null
	action: string
	entityType: string
	entityId: string
	payload?: AuditPayload
}

export const writeAuditLog = async (
	ctx: Pick<SessionContext, "tenantId">,
	entry: AuditEntry,
): Promise<void> => {
	if (ctx.tenantId === "") {
		throw new ApiError("VALIDATION_ERROR", "audit_log.tenant_required", [
			{ field: "tenantId", message: `cannot write audit log '${entry.action}' without a tenant` },
		])
	}

	await withSuperAdmin(async (tx) => {
		await tx.insert(auditLogs).values({
			tenantId: ctx.tenantId,
			actorId: entry.actorId,
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			payload: entry.payload ?? {},
		})
	})
}

export const writeAuditLogFor = async (
	tx: Tx,
	tenantId: string,
	entry: AuditEntry,
): Promise<void> => {
	if (tenantId === "") {
		throw new ApiError("VALIDATION_ERROR", "audit_log.tenant_required", [
			{ field: "tenantId", message: `cannot write audit log '${entry.action}' without a tenant` },
		])
	}

	await tx.insert(auditLogs).values({
		tenantId,
		actorId: entry.actorId,
		action: entry.action,
		entityType: entry.entityType,
		entityId: entry.entityId,
		payload: entry.payload ?? {},
	})
}
