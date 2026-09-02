import { eq } from "drizzle-orm"
import { ngos } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"

export type NgoRow = {
	id: string
	tenantId: string
	name: string
	registrationNo: string
	contactPhone: string
	serviceRadiusKm: string
	activeFrom: string
	activeTo: string
	verifiedAt: Date | null
	verificationStatus: string
	verificationSubmittedAt: Date | null
	verificationReviewedBy: string | null
	verificationReviewedAt: Date | null
	rejectionReason: string
	latitude: string | null
	longitude: string | null
	createdAt: Date
}

export const findNgoInCtx = async (ctx: SessionContext): Promise<NgoRow | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.select().from(ngos).where(eq(ngos.tenantId, ctx.tenantId)).limit(1)
		return (rows[0] as NgoRow | undefined) ?? null
	})
