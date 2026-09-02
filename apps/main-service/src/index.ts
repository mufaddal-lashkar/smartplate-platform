import { Elysia } from "elysia"
import { analyticsRoute } from "./modules/analytics/analytics.route"
import { authRoute } from "./modules/auth/auth.route"
import { sessionsRoute } from "./modules/auth/sessions.route"
import { catalogRoute } from "./modules/catalog/catalog.route"
import { dishRecipeRoute } from "./modules/catalog/dish-recipe.route"
import { ingredientsRoute } from "./modules/catalog/ingredients.route"
import { suppliersRoute } from "./modules/catalog/suppliers.route"
import { eventsRoute } from "./modules/events/events.route"
import { healthRoute } from "./modules/health/health.route"
import { insightsRoute } from "./modules/insights/insights.route"
import { inventoryRoute } from "./modules/inventory/inventory.route"
import { leftoversRoute } from "./modules/leftovers/leftovers.route"
import { listingsRoute } from "./modules/listings/listings.route"
import { marketRoute } from "./modules/market/market.route"
import { productionRoute } from "./modules/production/production.route"
import { reportsDlRoute } from "./modules/reports/reports.dl.route"
import { reportsRoute } from "./modules/reports/reports.route"
import { envelopePlugin } from "./shared/envelope.plugin"

const port = Number(process.env.PORT ?? 3000)

const app = new Elysia()
	.use(envelopePlugin)
	.use(healthRoute)
	.use(authRoute)
	.use(sessionsRoute)
	.use(eventsRoute)
	.use(catalogRoute)
	.use(ingredientsRoute)
	.use(suppliersRoute)
	.use(dishRecipeRoute)
	.use(inventoryRoute)
	.use(productionRoute)
	.use(leftoversRoute)
	.use(listingsRoute)
	.use(marketRoute)
	.use(analyticsRoute)
	.use(insightsRoute)
	.use(reportsRoute)
	.use(reportsDlRoute)
	.listen(port)

console.log(`main-service listening on :${port}`)

export type App = typeof app
