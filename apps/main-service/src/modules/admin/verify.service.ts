import { sql } from "drizzle-orm"
import { type SessionContext, withSuperAdmin } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { writeAuditLogFor } from "../../shared/audit"
import type { VerifyDecisionInput } from "./verify.schema"

type NgoVerifyRow = {
	id: string
	tenantId: string
	verificationStatus: string
	verifiedAt: Date | null
	verificationReviewedBy: string | null
	verificationReviewedAt: Date | null
	rejectionReason: string
}

const toNgoRow = (row: Record<string, unknown>): NgoVerifyRow => ({
	id: String(row.id),
	tenantId: String(row.tenant_id),
	verificationStatus: String(row.verification_status),
	verifiedAt: row.verified_at == null ? null : new Date(String(row.verified_at)),
	verificationReviewedBy:
		row.verification_reviewed_by == null ? null : String(row.verification_reviewed_by),
	verificationReviewedAt:
		row.verification_reviewed_at == null ? null : new Date(String(row.verification_reviewed_at)),
	rejectionReason: String(row.rejection_reason ?? ""),
})

export const decideVerification = async (
	ctx: SessionContext,
	tenantId: string,
	input: VerifyDecisionInput,
): Promise<NgoVerifyRow> => {
	if (ctx.role !== "super_admin") {
		throw new ApiError("AUTH_FORBIDDEN", "Only super_admin can verify NGOs.")
	}

	if (input.decision === "reject" && !input.rejectionReason) {
		throw new ApiError("VALIDATION_ERROR", "Rejection requires a reason.", [
			{ field: "rejectionReason", code: "VALIDATION_ERROR", message: "Required on reject" },
		])
	}

	const reviewedAt = new Date().toISOString()
	const newStatus = input.decision === "approve" ? "approved" : "rejected"
	const rejectionReason = input.decision === "reject" ? (input.rejectionReason ?? "") : ""

	return withSuperAdmin(async (tx) => {
		const ngoCheck = await tx.execute(sql`
			select id, tenant_id, verification_status
			from ngos
			where tenant_id = ${tenantId}
		`)
		if (ngoCheck.length === 0) {
			throw new ApiError("RESOURCE_NOT_FOUND", "NGO not found.")
		}

		const rows = await tx.execute(sql`
			update ngos
			set
				verification_status = ${newStatus}::ngo_verification_status,
				verification_reviewed_by = ${ctx.userId},
				verification_reviewed_at = ${reviewedAt}::timestamptz,
				rejection_reason = ${rejectionReason},
				verified_at = ${input.decision === "approve" ? reviewedAt : null}::timestamptz
			where tenant_id = ${tenantId}
			returning id, tenant_id, verification_status, verified_at, verification_reviewed_by,
			          verification_reviewed_at, rejection_reason
		`)
		const result = toNgoRow(rows[0] as Record<string, unknown>)

		await writeAuditLogFor(tx, tenantId, {
			actorId: ctx.userId,
			action: input.decision === "approve" ? "ngo.verify.approved" : "ngo.verify.rejected",
			entityType: "ngo",
			entityId: result.id,
			payload: { rejectionReason: rejectionReason === "" ? null : rejectionReason },
		})

		if (input.decision === "reject") {
			const payload = JSON.stringify({ rejectionReason: input.rejectionReason ?? "" })
			await tx.execute(sql`
				insert into notifications (tenant_id, channel, type, payload)
				values (
					${tenantId},
					'in_app'::notification_channel,
					${"verification.rejected"},
					${payload}::jsonb
				)
			`)
		}

		return result
	})
}
