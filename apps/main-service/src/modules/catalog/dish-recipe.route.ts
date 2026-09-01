import { Elysia } from "elysia"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { type RecipeLine, recipeInputSchema } from "./dish-recipe.schema"
import { getRecipe, setRecipe } from "./dish-recipe.service"

export const dishRecipeRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/dishes/:id/recipe", async ({ params, session }) => {
		const active = requireSession(session)
		requirePermission(active, "inventory.read")
		return { items: (await getRecipe(active, params.id)) as RecipeLine[] }
	})
	.put("/v1/dishes/:id/recipe", async ({ body, params, session }) => {
		const active = requireSession(session)
		requirePermission(active, "inventory.write")
		const input = recipeInputSchema.parse(body)
		return { items: (await setRecipe(active, params.id, input)) as RecipeLine[] }
	})
