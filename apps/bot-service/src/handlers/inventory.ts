import dayjs from "dayjs"
import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { empty, esc, heading, italic, lines, qty, truncate } from "../format"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

const LIST_LIMIT = 20

type StockAggregate = {
	ingredientId: string
	ingredientName: string
	baseUnit: string
	qtyOnHand: number
	lotCount: number
}

type InventoryLot = { id: string; qtyRemainingBase: string; expiryDate: string | null }
type ExpiringLot = { lot: InventoryLot; ingredientName: string; daysUntilExpiry: number }
type Ingredient = { id: string; name: string; category: string; baseUnit: string }

const findIngredientIdByName = async (ctx: BotContext, name: string): Promise<string> => {
	const data = await callMain<{ items: Ingredient[] }>(requireChatId(ctx), "/v1/ingredients")
	const target = name.toLowerCase().trim()
	const exact = data.items.find((item) => item.name.toLowerCase() === target)
	if (exact != null) return exact.id
	return data.items.find((item) => item.name.toLowerCase().includes(target))?.id ?? ""
}

export const handleInventory = {
	async stock(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: StockAggregate[] }>(
			requireChatId(ctx),
			"/v1/inventory/stock",
		)
		if (data.items.length === 0) {
			return {
				text: empty("Nothing in stock yet.", "Log a delivery: bought 3 kg of basmati rice"),
			}
		}
		const rows = data.items.map(
			(item) => `${esc(item.ingredientName)} — ${qty(item.qtyOnHand, item.baseUnit)}`,
		)
		return {
			text: lines([heading("In stock", data.items.length), truncate(rows, LIST_LIMIT, "/stock")]),
		}
	},

	async expiring(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const days = Math.max(1, Math.min(90, Number(entities.days ?? "3") || 3))
		const data = await callMain<{ items: ExpiringLot[] }>(
			requireChatId(ctx),
			`/v1/inventory/expiring?withinDays=${days}`,
		)
		if (data.items.length === 0) {
			return { text: empty(`Nothing expires in the next ${days} days.`, "") }
		}
		const rows = data.items.map((item) => {
			const when = item.daysUntilExpiry <= 0 ? "today" : `in ${item.daysUntilExpiry}d`
			return `${esc(item.ingredientName)} — ${item.lot.qtyRemainingBase} · ${when}`
		})
		return {
			text: lines([
				heading(`Expiring within ${days} days`, data.items.length),
				truncate(rows, LIST_LIMIT, "/expiring"),
			]),
		}
	},

	async purchasesCreate(
		ctx: BotContext,
		entities: Record<string, string>,
		d: DispatchContext,
	): Promise<Reply> {
		const name = (entities.ingredient ?? "").trim()
		const ingredientId = await findIngredientIdByName(ctx, name)
		if (ingredientId === "") {
			return {
				text: lines([
					esc(`I don't have an ingredient called "${name}".`),
					italic("Add it first: add ingredient basmati rice, kg"),
				]),
			}
		}
		const amount = Number(entities.qty)
		if (!Number.isFinite(amount) || amount <= 0) {
			return { text: esc("That quantity didn't look right. Try: bought 3 kg of basmati rice") }
		}
		await callMain(requireChatId(ctx), "/v1/inventory/purchases", {
			method: "POST",
			body: {
				ingredientId,
				qtyPurchasedBase: amount,
				unitCost: Number(entities.unitCost ?? "0") || 0,
				purchaseDate: entities.purchaseDate ?? dayjs().format("YYYY-MM-DD"),
				expiryDate: null,
			},
			idempotencyKey: d.idempotencyKey,
		})
		return {
			text: lines([
				`✅ Logged ${qty(amount, entities.unit ?? "kg")} of ${esc(name)}.`,
				italic("Send /stock to see the new level."),
			]),
		}
	},

	async adjustmentsCreate(
		ctx: BotContext,
		entities: Record<string, string>,
		d: DispatchContext,
	): Promise<Reply> {
		const name = (entities.ingredient ?? "").trim()
		const ingredientId = await findIngredientIdByName(ctx, name)
		if (ingredientId === "") {
			return { text: esc(`I don't have an ingredient called "${name}".`) }
		}
		const lots = await callMain<{ items: InventoryLot[] }>(
			requireChatId(ctx),
			`/v1/inventory/lots?ingredientId=${ingredientId}`,
		)
		const lot = lots.items[0]
		if (lot == null) return { text: esc(`No open lots for ${name}.`) }
		const amount = Number(entities.qty)
		if (!Number.isFinite(amount) || amount === 0) {
			return { text: esc("Tell me a non-zero quantity.") }
		}
		await callMain(requireChatId(ctx), "/v1/inventory/adjustments", {
			method: "POST",
			body: {
				lotId: lot.id,
				ingredientId,
				qtyDeltaBase: -Math.abs(amount),
				reason: entities.reason ?? "waste",
				notes: "",
			},
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `✅ Adjusted ${esc(name)} down by ${Math.abs(amount)}.` }
	},
}
