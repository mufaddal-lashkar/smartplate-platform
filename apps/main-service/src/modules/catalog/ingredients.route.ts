import type { Collection } from "@smartplate/contracts/envelope"
import { Elysia } from "elysia"
import type { Ingredient } from "../../db/schema"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { ingredientInputSchema } from "./ingredients.schema"
import {
	createIngredient,
	getIngredient,
	listIngredients,
	updateIngredientById,
} from "./ingredients.service"

export const ingredientsRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/ingredients", async ({ session }): Promise<Collection<Ingredient>> => {
		const active = requireSession(session)
		await requirePermission(active, "inventory.read")
		return { items: await listIngredients(active), nextCursor: "" }
	})
	.post("/v1/ingredients", async ({ body, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "inventory.write")
		return createIngredient(active, ingredientInputSchema.parse(body))
	})
	.patch("/v1/ingredients/:id", async ({ body, params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "inventory.write")
		return updateIngredientById(active, params.id, ingredientInputSchema.parse(body))
	})
	.get("/v1/ingredients/:id", async ({ params, session }) => {
		const active = requireSession(session)
		await requirePermission(active, "inventory.read")
		return getIngredient(active, params.id)
	})
