import type { BotContext } from "../bot/bot"
import { helpText } from "../bot/commands/help"
import { menuReply } from "../bot/commands/menu"
import type { Reply } from "../bot/reply"
import { handleAnalytics } from "./analytics"
import { handleAuth } from "./auth"
import { handleCatalog } from "./catalog"
import { handleInsights } from "./insights"
import { handleInventory } from "./inventory"
import { handleLeftovers } from "./leftovers"
import { handleListings } from "./listings"
import { handleMarket } from "./market"
import { handleAdmin } from "./ngo-verify"
import { handleNotifications } from "./notifications"
import { handlePermissions } from "./permissions"
import { handlePrep } from "./prep"
import { handleReports } from "./reports"
import { handleNgo, handleTenant } from "./tenant"
import { handleUsers } from "./users"

export type DispatchContext = {
	idempotencyKey: string
}

export type HandlerFn = (
	ctx: BotContext,
	entities: Record<string, string>,
	d: DispatchContext,
) => Promise<Reply>

export const dispatchTable: Record<string, HandlerFn> = {
	"auth.me": handleAuth.me,
	"auth.logout": handleAuth.logout,
	"sessions.list": handleAuth.sessionsList,
	"sessions.revoke": handleAuth.sessionsRevoke,
	"inventory.stock": handleInventory.stock,
	"inventory.expiring": handleInventory.expiring,
	"inventory.purchases.create": handleInventory.purchasesCreate,
	"inventory.adjustments.create": handleInventory.adjustmentsCreate,
	"prep.create": handlePrep.create,
	"prep.reuse_pending": handlePrep.reusePending,
	"prep.reuse_confirm": handlePrep.reuseConfirm,
	"leftovers.list": handleLeftovers.list,
	"leftovers.record": handleLeftovers.record,
	"leftovers.disposition_suggest": handleLeftovers.dispositionSuggest,
	"leftovers.dispositions": handleLeftovers.dispositions,
	"listings.own": handleListings.own,
	"listings.patch": handleListings.patch,
	"listings.cancel": handleListings.cancel,
	"listings.complete": handleListings.complete,
	"listings.no_show": handleListings.noShow,
	"market.browse": handleMarket.browse,
	"market.mine": handleMarket.mine,
	"market.claim": handleMarket.claim,
	"market.release": handleMarket.release,
	"market.pickups": handleMarket.pickups,
	"analytics.dashboard": handleAnalytics.dashboard,
	"analytics.waste": handleAnalytics.waste,
	"analytics.recovery": handleAnalytics.recovery,
	"analytics.dishes": handleAnalytics.dishes,
	"analytics.forecasts": handleAnalytics.forecasts,
	"insights.get": handleInsights.get,
	"reports.create": handleReports.create,
	"reports.list": handleReports.list,
	"reports.download": handleReports.download,
	"tenant.get": handleTenant.get,
	"tenant.update": handleTenant.update,
	"restaurant.get": handleTenant.restaurantGet,
	"restaurant.update": handleTenant.restaurantUpdate,
	"ngo.get": handleNgo.get,
	"ngo.update": handleNgo.update,
	"ngo.verification.submit": handleNgo.submitVerification,
	"users.list": handleUsers.list,
	"users.invite": handleUsers.invite,
	"users.update": handleUsers.update,
	"users.archive": handleUsers.archive,
	"permissions.list": handlePermissions.list,
	"permissions.set": handlePermissions.set,
	"permissions.clear": handlePermissions.clear,
	"admin.tenants.list": handleAdmin.tenantsList,
	"admin.verification.queue": handleAdmin.verificationQueue,
	"admin.verification.decide": handleAdmin.verificationDecide,
	"admin.analytics": handleAdmin.analytics,
	"catalog.dishes.list": handleCatalog.dishesList,
	"catalog.dishes.create": handleCatalog.dishesCreate,
	"catalog.ingredients.list": handleCatalog.ingredientsList,
	"catalog.ingredients.create": handleCatalog.ingredientsCreate,
	"catalog.suppliers.list": handleCatalog.suppliersList,
	"catalog.suppliers.create": handleCatalog.suppliersCreate,
	"catalog.recipe.get": handleCatalog.recipeGet,
	"catalog.recipe.put": handleCatalog.recipePut,
	"notifications.preferences.get": handleNotifications.get,
	"notifications.preferences.set": handleNotifications.set,
	help: async () => ({ text: helpText() }),
	menu: async (ctx) => menuReply(ctx.chatId ?? 0),
}
