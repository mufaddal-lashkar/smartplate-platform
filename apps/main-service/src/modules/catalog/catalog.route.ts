import type { Collection } from "@smartplate/contracts/envelope"
import { Elysia } from "elysia"
import type { Dish } from "../../db/schema"
import { systemClock } from "../../shared/clock"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { requireReadOnlyServiceToken } from "../bot/read-guard"
import { dishInputSchema } from "./catalog.schema"
import { archiveDish, createDish, listDishes, updateDish } from "./catalog.service"

export const catalogRoute = new Elysia()
	.use(sessionPlugin)
	.use(requireReadOnlyServiceToken)
	.get("/v1/dishes", async ({ session }): Promise<Collection<Dish>> => {
		const active = requireSession(session)
		await requirePermission(active, "inventory.read")
		return { items: await listDishes(active), nextCursor: "" }
	})
	.post("/v1/dishes", async ({ body, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "inventory.write")
		return createDish(active, dishInputSchema.parse(body), systemClock)
	})
	.patch("/v1/dishes/:id", async ({ body, params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "inventory.write")
		return updateDish(active, params.id, dishInputSchema.parse(body))
	})
	.delete("/v1/dishes/:id", async ({ params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "inventory.write")
		await archiveDish(active, params.id, systemClock)
		return { id: params.id, archived: true }
	})
