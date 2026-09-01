import type { Collection } from "@smartplate/contracts/envelope"
import { Elysia } from "elysia"
import type { Supplier } from "../../db/schema"
import { systemClock } from "../../shared/clock"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { supplierInputSchema } from "./suppliers.schema"
import {
	archiveSupplierById,
	createSupplier,
	listSuppliers,
	updateSupplier,
} from "./suppliers.service"

export const suppliersRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/suppliers", async ({ session }): Promise<Collection<Supplier>> => {
		const active = requireSession(session)
		requirePermission(active, "inventory.read")
		return { items: await listSuppliers(active), nextCursor: "" }
	})
	.post("/v1/suppliers", async ({ body, session }) => {
		const active = requireSession(session)
		requirePermission(active, "inventory.write")
		return createSupplier(active, supplierInputSchema.parse(body))
	})
	.patch("/v1/suppliers/:id", async ({ body, params, session }) => {
		const active = requireSession(session)
		requirePermission(active, "inventory.write")
		return updateSupplier(active, params.id, supplierInputSchema.parse(body))
	})
	.delete("/v1/suppliers/:id", async ({ params, session }) => {
		const active = requireSession(session)
		requirePermission(active, "inventory.write")
		await archiveSupplierById(active, params.id, systemClock)
		return { id: params.id, archived: true }
	})
