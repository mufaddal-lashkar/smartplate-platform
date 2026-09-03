export type FallbackParse = {
	intent: string
	confidence: number
	entities: Record<string, string>
	basis: string
}

const NUMERIC = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|piece|pieces|plate|plates|portions?)?/i
const DATE = /\b(\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday)\b/i
const TENANT_CODE = /^[a-z0-9-]+$/

const QTY_INTENTS = new Set([
	"inventory.purchases.create",
	"inventory.adjustments.create",
	"prep.create",
	"leftovers.record",
])

const KEYWORD_TABLE: Array<[string, RegExp]> = [
	["leftovers.record", /\b(log|record|new)\s+leftover|\bleftover\s+\d/i],
	["inventory.purchases.create", /\b(bought|purchased|received|restocked)\b/i],
	["inventory.adjustments.create", /\b(spilled|spillage|wasted|recount)\b/i],
	["prep.create", /\b(prepped|prepared|cooked|made)\b/i],
	["inventory.expiring", /\b(expiring|expires|about to expire)\b/i],
	["inventory.stock", /\b(stock|inventory|what do i have)\b/i],
	["leftovers.list", /\b(leftovers|what's left|whats left)\b/i],
	["prep.reuse_pending", /\b(reuse pending|pending reuse)\b/i],
	["market.browse", /\b(browse|market|what's available|open listings)\b/i],
	["market.mine", /\b(my claims)\b/i],
	["market.pickups", /\b(pickups|scheduled pickups)\b/i],
	["listings.own", /\b(my listings)\b/i],
	["analytics.dashboard", /\b(dashboard|how are we doing)\b/i],
	["reports.create", /\b(report)\b/i],
	["auth.me", /\b(who am i|my account)\b/i],
]

const extract = (intent: string, text: string): Record<string, string> => {
	const entities: Record<string, string> = {}
	if (QTY_INTENTS.has(intent)) {
		const numeric = NUMERIC.exec(text)
		const amount = Number(numeric?.[1] ?? "")
		if (numeric != null && !Number.isNaN(amount)) {
			entities.qty = String(amount)
			const unit = numeric[2]
			if (unit != null) entities.unit = unit.toLowerCase().replace(/s$/, "")
		}
	}
	if (intent === "prep.create") {
		const date = DATE.exec(text)
		if (date != null) entities.serviceDate = (date[1] ?? "").toLowerCase()
		if (/lunch/i.test(text)) entities.mealPeriod = "lunch"
		else if (/dinner/i.test(text)) entities.mealPeriod = "dinner"
		else if (/breakfast/i.test(text)) entities.mealPeriod = "breakfast"
	}
	return entities
}

export const parseFallback = (text: string): FallbackParse => {
	const trimmed = text.trim()
	for (const [intent, pattern] of KEYWORD_TABLE) {
		if (!pattern.test(trimmed)) continue
		return {
			intent,
			confidence: 0.6,
			entities: extract(intent, trimmed),
			basis: `fallback regex match for '${intent}' over ${trimmed.length} chars`,
		}
	}
	return {
		intent: "unknown",
		confidence: 0.3,
		entities: {},
		basis: "no keyword matched in fallback parser",
	}
}

export const isValidTenantCode = (code: string): boolean => TENANT_CODE.test(code)
