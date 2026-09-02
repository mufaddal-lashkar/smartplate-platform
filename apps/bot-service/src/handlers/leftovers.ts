import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type Leftover = {
	id: string
	dishId: string
	dishName: string
	qty: string
	unit: string
	storage: string
	safeUntil: string
}
type Dish = { id: string; name: string }

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)
const todayIso = () => {
	const d = new Date()
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const nowIso = () => new Date().toISOString()
const findDishIdByName = async (ctx: BotContext, name: string): Promise<string | null> => {
	const data = await callMain<{ items: Dish[] }>(requireChatId(ctx), "/v1/dishes")
	const target = name.toLowerCase().trim()
	const hit = data.items.find((d) => d.name.toLowerCase() === target)
	return hit?.id ?? data.items.find((d) => d.name.toLowerCase().includes(target))?.id ?? null
}

export const handleLeftovers = {
	async list(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: Leftover[] }>(
			requireChatId(ctx),
			`/v1/leftovers/?serviceDate=${todayIso()}`,
		)
		if (data.items.length === 0) return { text: "No leftovers for today." }
		const lines = data.items.map(
			(l) => `• ${escapeMd(l.dishName)} — ${l.qty} ${l.unit} (${l.storage})`,
		)
		return { text: `*Leftovers today*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async record(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const name = String(entities.dish ?? "").trim()
		if (name === "") return { text: "Tell me the dish, e.g. 'log leftover 2 portions paneer'." }
		const dishId = await findDishIdByName(ctx, name)
		if (dishId == null) return { text: `I don't see a dish called "${name}".` }
		const qty = Number(entities.qty ?? 0)
		if (!Number.isFinite(qty) || qty <= 0) return { text: "Tell me a positive quantity." }
		const unit = String(entities.unit ?? "plate") as "kg" | "plate" | "piece" | "litre"
		const storage = String(entities.storage ?? "refrigerated") as
			| "room_temp"
			| "refrigerated"
			| "frozen"
		await callMain(requireChatId(ctx), "/v1/leftovers/", {
			method: "POST",
			body: { dishId, qty, unit, storage, preparedAt: nowIso() },
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Recorded leftover: ${qty} ${unit} ${escapeMd(name)}.` }
	},

	async dispositionSuggest(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const leftoverId = String(entities.leftoverId ?? "").trim()
		if (leftoverId === "") return { text: "Tell me the leftover id." }
		const data = await callMain<{
			suggestedRetainQty: number
			suggestedSellQty: number
			suggestedDonateQty: number
			suggestedPricePerUnit: number
			confidence: string
			basis: string
		}>(requireChatId(ctx), `/v1/leftovers/${leftoverId}/disposition-suggestion`)
		return {
			text: `*Suggestion*\nretain ${data.suggestedRetainQty}\nsell ${data.suggestedSellQty}\ndonate ${data.suggestedDonateQty}\nprice ${data.suggestedPricePerUnit}\nconfidence: ${data.confidence}`,
			parseMode: "MarkdownV2",
		}
	},

	async dispositions(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const list = Array.isArray(entities.dispositions) ? entities.dispositions : []
		if (list.length === 0)
			return { text: "Send dispositions like 'dispose leftover <id>: retain 0, sell 1, donate 1'." }
		const allocations = list.map((raw) => {
			const item = raw as Record<string, unknown>
			return {
				leftoverId: String(item.leftoverId ?? ""),
				retainQty: Number(item.retainQty ?? 0),
				sellQty: Number(item.sellQty ?? 0),
				donateQty: Number(item.donateQty ?? 0),
				wasteQty: Number(item.wasteQty ?? 0),
				sellPricePerUnit: Number(item.sellPricePerUnit ?? 0),
			}
		})
		await callMain(requireChatId(ctx), "/v1/leftovers/dispositions", {
			method: "POST",
			body: { allocations },
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Committed ${allocations.length} disposition(s).` }
	},
}
