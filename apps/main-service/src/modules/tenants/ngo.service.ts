import { sql } from "drizzle-orm"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { writeAuditLog } from "../../shared/audit"
import { findNgoInCtx, type NgoRow } from "./ngo.queries"
import type { SubmitVerificationInput, UpdateNgoInput } from "./ngo.schema"

const toNgoRow = (row: Record<string, unknown>): NgoRow => ({
	id: String(row.id),
	tenantId: String(row.tenant_id),
	name: String(row.name),
	registrationNo: String(row.registration_no ?? ""),
	contactPhone: String(row.contact_phone ?? ""),
	serviceRadiusKm: String(row.service_radius_km),
	activeFrom: String(row.active_from ?? "00:00"),
	activeTo: String(row.active_to ?? "23:59"),
	verifiedAt: row.verified_at == null ? null : new Date(String(row.verified_at)),
	verificationStatus: String(row.verification_status ?? "pending"),
	verificationSubmittedAt:
		row.verification_submitted_at == null ? null : new Date(String(row.verification_submitted_at)),
	verificationReviewedBy:
		row.verification_reviewed_by == null ? null : String(row.verification_reviewed_by),
	verificationReviewedAt:
		row.verification_reviewed_at == null ? null : new Date(String(row.verification_reviewed_at)),
	rejectionReason: String(row.rejection_reason ?? ""),
	latitude: row.latitude == null ? null : String(row.latitude),
	longitude: row.longitude == null ? null : String(row.longitude),
	createdAt: new Date(String(row.created_at)),
})

export const updateNgo = async (ctx: SessionContext, input: UpdateNgoInput): Promise<NgoRow> => {
	if (ctx.tenantType !== "ngo") {
		throw new ApiError("TENANT_TYPE_MISMATCH", "This action is not available for your account.")
	}

	const before = await findNgoInCtx(ctx)
	if (before == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "NGO not found.")
	}

	const result = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			update ngos
			set
				name = coalesce(${input.name ?? null}, name),
				contact_phone = coalesce(${input.contactPhone ?? null}, contact_phone),
				active_from = coalesce(${input.activeFrom ?? null}, active_from),
				active_to = coalesce(${input.activeTo ?? null}, active_to),
				service_radius_km = coalesce(${input.serviceRadiusKm ?? null}, service_radius_km),
				latitude = coalesce(${input.latitude ?? null}, latitude),
				longitude = coalesce(${input.longitude ?? null}, longitude)
			where tenant_id = ${ctx.tenantId}
			returning id, tenant_id, name, registration_no, contact_phone, service_radius_km,
			          active_from, active_to, verified_at, verification_status,
			          verification_submitted_at, verification_reviewed_by, verification_reviewed_at,
			          rejection_reason, latitude, longitude, created_at
		`)
		return rows[0] ? toNgoRow(rows[0] as Record<string, unknown>) : null
	})

	if (result == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "NGO not found.")
	}

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: "ngo.update",
			entityType: "ngo",
			entityId: result.id,
			payload: { ...input },
		},
	)

	return result
}

export const submitVerification = async (
	ctx: SessionContext,
	input: SubmitVerificationInput,
): Promise<NgoRow> => {
	if (ctx.tenantType !== "ngo") {
		throw new ApiError("TENANT_TYPE_MISMATCH", "This action is not available for your account.")
	}

	const before = await findNgoInCtx(ctx)
	if (before == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "NGO not found.")
	}

	if (before.verifiedAt != null || before.verificationStatus === "approved") {
		throw new ApiError("VALIDATION_ERROR", "This NGO is already verified.", [
			{ field: "verification", code: "VALIDATION_ERROR", message: "Already verified" },
		])
	}

	const submittedAt = new Date().toISOString()
	const result = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			update ngos
			set
				registration_no = ${input.registrationNo},
				contact_phone = ${input.contactPhone},
				verification_status = 'pending'::ngo_verification_status,
				verification_submitted_at = ${submittedAt}::timestamptz,
				verification_reviewed_by = null,
				verification_reviewed_at = null,
				rejection_reason = ''
			where tenant_id = ${ctx.tenantId}
			returning id, tenant_id, name, registration_no, contact_phone, service_radius_km,
			          active_from, active_to, verified_at, verification_status,
			          verification_submitted_at, verification_reviewed_by, verification_reviewed_at,
			          rejection_reason, latitude, longitude, created_at
		`)
		return rows[0] ? toNgoRow(rows[0] as Record<string, unknown>) : null
	})

	if (result == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "NGO not found.")
	}

	await writeAuditLog(
		{ tenantId: ctx.tenantId },
		{
			actorId: ctx.userId,
			action: "verification.submit",
			entityType: "ngo",
			entityId: result.id,
			payload: {
				registrationNo: input.registrationNo,
				contactName: input.contactName,
				contactPhone: input.contactPhone,
			},
		},
	)

	return result
}

export const findNgo = async (ctx: SessionContext): Promise<NgoRow> => {
	if (ctx.tenantType !== "ngo") {
		throw new ApiError("TENANT_TYPE_MISMATCH", "This action is not available for your account.")
	}
	const ngo = await findNgoInCtx(ctx)
	if (ngo == null) {
		throw new ApiError("RESOURCE_NOT_FOUND", "NGO not found.")
	}
	return ngo
}
