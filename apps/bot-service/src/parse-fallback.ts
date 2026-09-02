export type FallbackParse = {
	intent: string
	confidence: number
	entities: Record<string, string | number | boolean | string[]>
	needs_clarification: string[]
	basis: string
}

const NUMERIC = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|piece|pieces|plate|plates|portions?)?/i
const DATE = /\b(\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday)\b/i
const TENANT_CODE = /^[a-z0-9-]+$/

const KEYWORD_TABLE: Array<[string, RegExp]> = [
	["help", /^(\/)?help\b/i],
	["menu", /^(\/)?menu\b/i],
	["auth.me", /\b(who am i|my account|\/me)\b/i],
	["auth.logout", /\b(logout|sign out|log out|\/logout)\b/i],
	["sessions.list", /\b(active sessions|list sessions|\/sessions)\b/i],
	["inventory.stock", /\b(stock|what do i have|\/stock)\b/i],
	["inventory.expiring", /\b(expiring|about to expire|expir(y|ies))\b/i],
	["inventory.purchases.create", /\b(purchase|bought|received|restock)\b/i],
	["inventory.adjustments.create", /\b(adjust|spillage|recount)\b/i],
	["prep.create", /\b(prep|prepped|prepared|cooked)\b/i],
	["prep.reuse_pending", /\b(reuse pending|pending reuse)\b/i],
	["prep.reuse_confirm", /\b(confirm reuse|reuse confirmed)\b/i],
	["leftovers.list", /\b(leftovers|what's left|whats left)\b/i],
	["leftovers.record", /\b(log leftover|record leftover|new leftover|leftover \d)\b/i],
	["leftovers.disposition_suggest", /\b(suggest|what should i do)\b/i],
	["leftovers.dispositions", /\b(disposition|decide|finalise|finalize)\b/i],
	["listings.own", /\b(my listings|own listings|\/listings)\b/i],
	["listings.patch", /\b(update price|change price|adjust price)\b/i],
	["listings.cancel", /\b(cancel listing)\b/i],
	["listings.complete", /\b(complete listing|mark collected)\b/i],
	["listings.no_show", /\b(no show|no-show)\b/i],
	["market.browse", /\b(browse|what's available|open listings|\/browse)\b/i],
	["market.mine", /\b(my claims|\/claims)\b/i],
	["market.claim", /\b(claim|reserve)\b/i],
	["market.release", /\b(release|unclaim)\b/i],
	["market.pickups", /\b(pickups|scheduled pickups|\/pickups)\b/i],
	["analytics.dashboard", /\b(dashboard)\b/i],
	["analytics.waste", /\b(waste report|waste analytics)\b/i],
	["analytics.recovery", /\b(recovery)\b/i],
	["analytics.dishes", /\b(dish performance|dishes report)\b/i],
	["analytics.forecasts", /\b(forecast|prediction)\b/i],
	["insights.get", /\b(insight|insights)\b/i],
	[
		"reports.create",
		/\b(generate report|create report|send me a report|weekly report|monthly report)\b/i,
	],
	["reports.list", /\b(my reports|list reports|\/reports)\b/i],
	["reports.download", /\b(download report)\b/i],
	["tenant.get", /\b(my tenant|tenant details)\b/i],
	["tenant.update", /\b(update tenant|rename tenant)\b/i],
	["restaurant.get", /\b(restaurant details)\b/i],
	["restaurant.update", /\b(update restaurant)\b/i],
	["ngo.get", /\b(ngo details)\b/i],
	["ngo.update", /\b(update ngo)\b/i],
	["ngo.verification.submit", /\b(submit verification|verify my ngo)\b/i],
	["users.list", /\b(team|list users|my team|\/team)\b/i],
	["users.invite", /\b(invite|add user|invite user)\b/i],
	["users.update", /\b(update user|change role)\b/i],
	["users.archive", /\b(archive user|deactivate user)\b/i],
	["permissions.list", /\b(user permissions|my permissions)\b/i],
	["permissions.set", /\b(grant permission|allow)\b/i],
	["permissions.clear", /\b(revoke permission|remove permission)\b/i],
	["admin.tenants.list", /\b(all tenants|list tenants)\b/i],
	["admin.verification.queue", /\b(pending verifications|verification queue)\b/i],
	["admin.verification.decide", /\b(approve|reject verification)\b/i],
	["admin.analytics", /\b(platform analytics|platform metrics)\b/i],
	["catalog.dishes.list", /\b(dishes|menu items|\/dishes)\b/i],
	["catalog.dishes.create", /\b(add dish|new dish)\b/i],
	["catalog.ingredients.list", /\b(ingredients|\/ingredients)\b/i],
	["catalog.ingredients.create", /\b(add ingredient|new ingredient)\b/i],
	["catalog.suppliers.list", /\b(suppliers|vendors|\/suppliers)\b/i],
	["catalog.suppliers.create", /\b(add supplier|new supplier)\b/i],
	["catalog.recipe.get", /\b(recipe|show recipe)\b/i],
	["catalog.recipe.put", /\b(update recipe|set recipe)\b/i],
	["notifications.preferences.get", /\b(notification preferences|alert settings)\b/i],
	["notifications.preferences.set", /\b(update notifications|set quiet hours|change radius)\b/i],
]

export const parseFallback = (text: string): FallbackParse => {
	const trimmed = text.trim()
	for (const [intent, pattern] of KEYWORD_TABLE) {
		if (pattern.test(trimmed)) {
			return extract(intent, trimmed)
		}
	}
	return {
		intent: "unknown",
		confidence: 0.3,
		entities: {},
		needs_clarification: ["intent"],
		basis: "no keyword matched in fallback parser",
	}
}

const extract = (intent: string, text: string): FallbackParse => {
	const entities: Record<string, string | number | boolean | string[]> = {}
	const numeric = NUMERIC.exec(text)
	if (numeric != null) {
		const value = Number(numeric[1])
		if (!Number.isNaN(value)) {
			if (intent === "inventory.purchases.create") entities.qty = value
			if (intent === "inventory.adjustments.create") entities.qty = value
			if (intent === "prep.create") entities.qty = value
			if (intent === "leftovers.record") entities.qty = value
			if (numeric[2] != null) {
				const unit = numeric[2].toLowerCase().replace(/s$/, "")
				if (intent === "inventory.purchases.create") entities.unit = unit
				if (intent === "inventory.adjustments.create") entities.unit = unit
				if (intent === "prep.create") entities.unit = unit
				if (intent === "leftovers.record") entities.unit = unit
			}
		}
	}
	const date = DATE.exec(text)
	if (date != null && intent === "prep.create") {
		entities.serviceDate = date[1].toLowerCase()
	}
	if (intent === "prep.create") {
		if (/lunch/i.test(text)) entities.mealPeriod = "lunch"
		else if (/dinner/i.test(text)) entities.mealPeriod = "dinner"
		else if (/breakfast/i.test(text)) entities.mealPeriod = "breakfast"
	}

	const needs: string[] = []
	if (
		intent === "inventory.purchases.create" ||
		intent === "inventory.adjustments.create" ||
		intent === "prep.create" ||
		intent === "leftovers.record"
	) {
		if (entities.qty == null) needs.push("qty")
	}
	if (intent === "ngo.verification.submit") {
		if (!/reg/i.test(text)) needs.push("registrationNo")
		if (!/\+\d|\d{10}/.test(text)) needs.push("contactPhone")
	}

	return {
		intent,
		confidence: needs.length === 0 ? 0.6 : 0.4,
		entities,
		needs_clarification: needs,
		basis: `fallback regex match for intent '${intent}' over ${text.length} chars`,
	}
}

export const isValidTenantCode = (code: string): boolean => TENANT_CODE.test(code)
