import { eq } from "drizzle-orm"
import type { Elysia } from "elysia"
import { tenants } from "../../db/schema"
import { type SessionContext, withSystem } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import { isReadOnlyPath } from "../../shared/rbac"

const readToken = (): string => process.env.SERVICE_READ_TOKEN ?? ""

const resolveTenantType = async (tenantId: string): Promise<SessionContext["tenantType"]> => {
	const rows = await withSystem(async (tx) =>
		tx.select({ type: tenants.type }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
	)
	const row = rows[0]
	if (row == null) {
		throw new ApiError("AUTH_FORBIDDEN", "x-tenant-id does not reference a known tenant.")
	}
	return row.type
}

const buildSession = async (tenantHeader: string, userHeader: string): Promise<SessionContext> => {
	if (tenantHeader === "") {
		throw new ApiError(
			"AUTH_FORBIDDEN",
			"Read-only token requires x-tenant-id header on this endpoint.",
		)
	}
	const tenantType = await resolveTenantType(tenantHeader)
	return {
		tenantId: tenantHeader,
		tenantType,
		role: "owner",
		userId: userHeader,
	}
}

export const requireReadOnlyServiceToken = (app: Elysia): Elysia =>
	app.derive({ as: "global" }, async ({ request, session: existingSession }) => {
		if (existingSession != null) {
			return { session: existingSession, authMode: "session" as const }
		}
		const url = new URL(request.url)
		const header = request.headers.get("x-service-token") ?? ""
		const bot = process.env.SERVICE_TOKEN ?? ""
		if (header === bot && bot !== "") {
			return { session: null, authMode: "full" as const }
		}
		const read = readToken()
		if (read === "" || header !== read) {
			return { session: null, authMode: "none" as const }
		}
		if (!isReadOnlyPath(url.pathname)) {
			throw new ApiError("AUTH_FORBIDDEN", "Read-only token cannot be used on this endpoint.")
		}
		const tenantHeader = request.headers.get("x-tenant-id") ?? ""
		const userHeader = request.headers.get("x-user-id") ?? ""
		const ctx = await buildSession(tenantHeader, userHeader)
		return { session: ctx, authMode: "read" as const }
	})
