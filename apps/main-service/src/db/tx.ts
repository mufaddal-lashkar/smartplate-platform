import { sql } from "drizzle-orm"
import { db } from "./client"
import type { Role, TenantType } from "./schema"

export type SessionContext = {
	tenantId: string
	tenantType: TenantType
	role: Role
	userId: string
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const setSessionConfig = async (tx: Tx, key: string, value: string) => {
	await tx.execute(sql`select set_config(${key}, ${value}, true)`)
}

export const applySessionContext = async (tx: Tx, ctx: SessionContext) => {
	await setSessionConfig(tx, "app.tenant_id", ctx.tenantId)
	await setSessionConfig(tx, "app.tenant_type", ctx.tenantType)
	await setSessionConfig(tx, "app.role", ctx.role)
	await setSessionConfig(tx, "app.user_id", ctx.userId)
}

export const withTenant = async <T>(ctx: SessionContext, fn: (tx: Tx) => Promise<T>): Promise<T> =>
	db.transaction(async (tx) => {
		await applySessionContext(tx, ctx)
		return fn(tx)
	})

export const withSystem = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
	db.transaction(async (tx) => {
		await setSessionConfig(tx, "app.role", "system")
		return fn(tx)
	})
