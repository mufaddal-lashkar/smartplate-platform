import { eq } from "drizzle-orm"
import { tenants } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"

export type TenantRow = {
	id: string
	type: string
	name: string
	status: string
	createdAt: Date
}

export const findTenantInCtx = async (ctx: SessionContext): Promise<TenantRow | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1)
		return (rows[0] as TenantRow | undefined) ?? null
	})
