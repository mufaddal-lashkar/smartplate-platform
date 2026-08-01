import { eq } from "drizzle-orm"
import { ngos, restaurants, tenants, users } from "../../db/schema"
import { type SessionContext, withSystem, withTenant } from "../../db/tx"

export const findUserByEmail = async (email: string) =>
	withSystem(async (tx) => {
		const rows = await tx.select().from(users).where(eq(users.email, email)).limit(1)
		return rows[0] ?? null
	})

export const findUserById = async (userId: string) =>
	withSystem(async (tx) => {
		const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
		return rows[0] ?? null
	})

export const findTenantById = async (tenantId: string) =>
	withSystem(async (tx) => {
		const rows = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
		return rows[0] ?? null
	})

export const findProfileName = async (ctx: SessionContext): Promise<string> =>
	withTenant(ctx, async (tx) => {
		if (ctx.tenantType === "restaurant") {
			const rows = await tx.select({ name: restaurants.name }).from(restaurants).limit(1)
			return rows[0]?.name ?? ""
		}
		const rows = await tx.select({ name: ngos.name }).from(ngos).limit(1)
		return rows[0]?.name ?? ""
	})
