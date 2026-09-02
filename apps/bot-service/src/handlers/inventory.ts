import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type StockRow = {
	ingredientId: string
	ingredientName: string
	category: string
	totalRemaining: number
	baseUnit: string
}

type Ingredient = { id: string; name: string; category: string; baseUnit: string }
type Lot = { id: string; ingredientId: string; qtyRemainingBase: string; expiryDate: string | null }

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

const findIngredientIdByName = async (ctx: BotContext, name: string): Promise<string | null> => {
	const data = await callMain<{ items: Ingredient[] }>(requireChatId(ctx), "/v1/ingredients")
	const target = name.toLowerCase().trim()
	const hit = data.items.find((i) => i.name.toLowerCase() === target)
	return hit?.id ?? data.items.find((i) => i.name.toLowerCase().includes(target))?.id ?? null
}

const todayIso = () => {
	const d = new Date()
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, "0")
	const day = String(d.getDate()).padStart(2, "0")
	return `${y}-${m}-${day}`
}

export const handleInventory = {
	async stock(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: StockRow[] }>(requireChatId(ctx), "/v1/inventory/stock")
		if (data.items.length === 0) return { text: "No stock yet." }
		const lines = data.items.map(
			(i) => `• ${escapeMd(i.ingredientName)} — ${i.totalRemaining} ${i.baseUnit}`,
		)
		return {
			text: `*Stock*\n${lines.slice(0, 30).join("\n")}`,
			parseMode: "MarkdownV2",
		}
	},

	async expiring(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const days = Math.max(1, Math.min(90, Number(entities.days ?? 3)))
		const data = await callMain<{
			items: Array<{
				id: string
				ingredientName: string
				qtyRemaining: number
				baseUnit: string
				expiryDate: string | null
			}>
		}>(requireChatId(ctx), `/v1/inventory/expiring?withinDays=${days}`)
		if (data.items.length === 0) return { text: `Nothing expires in the next ${days} days.` }
		const lines = data.items.map(
			(l) =>
				`• ${escapeMd(l.ingredientName)} — ${l.qtyRemaining} ${l.baseUnit} (${l.expiryDate ?? "no date"})`,
		)
		return { text: `*Expiring in ${days} days*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async purchasesCreate(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const name = String(entities.ingredient ?? "").trim()
		if (name === "") return { text: "Tell me the ingredient name, e.g. 'bought 3 kg of basmati'." }
		const ingredientId = await findIngredientIdByName(ctx, name)
		if (ingredientId == null)
			return {
				text: `I don't see an ingredient called "${name}". Add it first via the web app or /add ingredient.`,
			}
		const qty = Number(entities.qty ?? 0)
		if (!Number.isFinite(qty) || qty <= 0)
			return { text: "Tell me a quantity, e.g. 'bought 3 kg of basmati'." }
		const unit = String(entities.unit ?? "kg")
		const unitCost = Number(entities.unitCost ?? 0)
		const body = {
			ingredientId,
			qtyPurchasedBase: qty,
			unitCost,
			purchaseDate: String(entities.purchaseDate ?? todayIso()),
			expiryDate: null,
		}
		await callMain(requireChatId(ctx), "/v1/inventory/purchases", {
			method: "POST",
			body,
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Logged purchase of ${qty} ${unit} ${escapeMd(name)}.` }
	},

	async adjustmentsCreate(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const name = String(entities.ingredient ?? "").trim()
		if (name === "")
			return { text: "Tell me the ingredient name, e.g. 'adjust 1 kg of basmati — waste'." }
		const ingredientId = await findIngredientIdByName(ctx, name)
		if (ingredientId == null) return { text: `I don't see an ingredient called "${name}".` }
		const lots = await callMain<{ items: Lot[] }>(
			requireChatId(ctx),
			`/v1/inventory/lots?ingredientId=${ingredientId}`,
		)
		const lot = lots.items[0]
		if (lot == null) return { text: `No lots for ${escapeMd(name)}.` }
		const qty = Number(entities.qty ?? 0)
		if (!Number.isFinite(qty) || qty === 0) return { text: "Tell me a non-zero quantity." }
		const reason = String(entities.reason ?? "waste") as
			| "spoil"
			| "waste"
			| "transfer"
			| "count_correction"
			| "use"
			| "return"
		await callMain(requireChatId(ctx), "/v1/inventory/adjustments", {
			method: "POST",
			body: {
				lotId: lot.id,
				ingredientId,
				qtyDeltaBase: -Math.abs(qty),
				reason,
				notes: "",
			},
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Adjusted ${escapeMd(name)} by ${qty}.` }
	},
}

void escape
