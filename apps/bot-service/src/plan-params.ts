import { adaptersForIntent } from "@smartplate/contracts/intents"
import dayjs, { type Dayjs } from "dayjs"
import type { BotContext } from "./bot/bot"
import { callMain } from "./main-client"

const DATE_RANGE_VOCAB = new Set([
	"today",
	"yesterday",
	"last-3-days",
	"last-7-days",
	"last-14-days",
	"last-28-days",
	"this-week",
	"this-month",
	"last-month",
])

const UNIT_NORMALISATION: Record<string, string> = {
	plates: "plate",
	plate: "plate",
	pieces: "piece",
	piece: "piece",
	portions: "portion",
	portion: "portion",
	servings: "serving",
	serving: "serving",
	kg: "kg",
	kilogram: "kg",
	kilograms: "kg",
	g: "g",
	gram: "g",
	grams: "g",
	l: "l",
	litre: "l",
	liter: "l",
	litres: "l",
	liters: "l",
	ml: "ml",
	millilitre: "ml",
	milliliter: "ml",
}

const RESERVED_PARAM_KEYS = new Set(["safeUntil", "safe_until", "expiresAt", "expires_at"])

type Dish = { id: string; name: string }

type ResolvedParams = Record<string, string | number | boolean>

export type Resolution = {
	resolved: ResolvedParams
	missing: string[]
	clarification: { kind: "dish"; name: string; candidates: Dish[] } | null
}

const RANGE_KEYS = new Set(["from", "to", "start", "end", "serviceDate", "purchaseDate"])

const resolveDateRange = (symbolic: string, now: Dayjs): { from: string; to: string } => {
	const today = now.format("YYYY-MM-DD")
	if (symbolic.includes("..")) {
		const [a = "", b = ""] = symbolic.split("..")
		return { from: a, to: b }
	}
	switch (symbolic) {
		case "today":
			return { from: today, to: today }
		case "yesterday":
			return { from: now.subtract(1, "day").format("YYYY-MM-DD"), to: today }
		case "last-3-days":
			return { from: now.subtract(2, "day").format("YYYY-MM-DD"), to: today }
		case "last-7-days":
			return { from: now.subtract(6, "day").format("YYYY-MM-DD"), to: today }
		case "last-14-days":
			return { from: now.subtract(13, "day").format("YYYY-MM-DD"), to: today }
		case "last-28-days":
			return { from: now.subtract(27, "day").format("YYYY-MM-DD"), to: today }
		case "this-week":
			return { from: now.startOf("week").format("YYYY-MM-DD"), to: today }
		case "this-month":
			return { from: now.startOf("month").format("YYYY-MM-DD"), to: today }
		case "last-month":
			return {
				from: now.subtract(1, "month").startOf("month").format("YYYY-MM-DD"),
				to: now.subtract(1, "month").endOf("month").format("YYYY-MM-DD"),
			}
		default:
			return { from: today, to: today }
	}
}

const resolveDate = (symbolic: string, now: Dayjs): string => {
	const today = now.format("YYYY-MM-DD")
	if (DATE_RANGE_VOCAB.has(symbolic) || symbolic.includes("..")) {
		return resolveDateRange(symbolic, now).from
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(symbolic)) return symbolic
	return today
}

const normaliseUnit = (value: string): string => {
	const lowered = value.toLowerCase().trim()
	return UNIT_NORMALISATION[lowered] ?? lowered
}

const findDishCandidates = async (ctx: BotContext, name: string): Promise<Dish[]> => {
	if (name === "") return []
	const data = await callMain<{ items: Dish[] }>(requireChatId(ctx), "/v1/dishes")
	const target = name.toLowerCase().trim()
	const exact = data.items.filter((dish) => dish.name.toLowerCase() === target)
	if (exact.length > 0) return exact
	return data.items.filter((dish) => dish.name.toLowerCase().includes(target)).slice(0, 5)
}

const requireChatId = (ctx: BotContext): number => {
	if (ctx.chatId == null) throw new Error("chat id missing on this update")
	return ctx.chatId
}

export const resolveParams = async (
	ctx: BotContext,
	intent: string,
	symbolic: Record<string, string | number | boolean>,
	now: Dayjs = dayjs(),
): Promise<Resolution> => {
	const adapters = adaptersForIntent(intent)
	const resolved: ResolvedParams = {}
	const missing: string[] = []
	let clarification: Resolution["clarification"] = null

	for (const key of Object.keys(symbolic)) {
		if (RESERVED_PARAM_KEYS.has(key)) {
			throw new Error(`param key '${key}' is reserved (R36)`)
		}
	}

	for (const adapter of adapters) {
		const raw = symbolic[adapter.name]
		if (raw == null || raw === "") {
			if (adapter.required) missing.push(adapter.name)
			continue
		}
		const stringValue = String(raw)
		switch (adapter.kind) {
			case "date-range": {
				if (!DATE_RANGE_VOCAB.has(stringValue) && !stringValue.includes("..")) {
					throw new Error(
						`date-range param '${adapter.name}' must use the closed vocabulary, got '${stringValue}'`,
					)
				}
				const range = resolveDateRange(stringValue, now)
				const key = adapter.name === "period" ? "period" : adapter.name
				if (key === "period") {
					resolved.period = stringValue
				} else {
					resolved[key] = range.from
					if (RANGE_KEYS.has(key)) {
						resolved.to = range.to
					}
				}
				break
			}
			case "date": {
				if (!DATE_RANGE_VOCAB.has(stringValue) && !stringValue.includes("..")) {
					if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
						throw new Error(
							`date param '${adapter.name}' must be ISO YYYY-MM-DD or a vocabulary word, got '${stringValue}'`,
						)
					}
				}
				resolved[adapter.name] = resolveDate(stringValue, now)
				break
			}
			case "dish": {
				const candidates = await findDishCandidates(ctx, stringValue)
				if (candidates.length === 1) {
					resolved[adapter.name] = candidates[0]?.id ?? ""
				} else if (candidates.length > 1) {
					clarification = { kind: "dish", name: stringValue, candidates }
				} else if (adapter.required) {
					missing.push(adapter.name)
				}
				break
			}
			case "unit": {
				resolved[adapter.name] = normaliseUnit(stringValue)
				break
			}
			case "enum": {
				const options = adapter.options ?? []
				if (options.length > 0 && !options.includes(stringValue)) {
					throw new Error(
						`enum param '${adapter.name}' must be one of ${options.join(", ")}, got '${stringValue}'`,
					)
				}
				resolved[adapter.name] = stringValue
				break
			}
			case "raw": {
				resolved[adapter.name] = stringValue
				break
			}
		}
	}

	return { resolved, missing, clarification }
}

export const findFirstMissing = (intent: string, params: ResolvedParams): string[] => {
	const adapters = adaptersForIntent(intent)
	return adapters
		.filter((adapter) => adapter.required)
		.filter((adapter) => {
			const value = params[adapter.name]
			return value == null || value === ""
		})
		.map((adapter) => adapter.name)
}

export const resolveSingleDate = resolveDate
export const resolveSingleDateRange = resolveDateRange
export const validateRangeVocab = (value: string): boolean =>
	DATE_RANGE_VOCAB.has(value) || value.includes("..") || /^\d{4}-\d{2}-\d{2}$/.test(value)
