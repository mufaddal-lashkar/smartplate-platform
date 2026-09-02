import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type Dish = {
	id: string
	name: string
	category: string
	servingUnit: string
	avgServingWeightG: string
	shelfLifeHours: number
	isReusable: boolean
}
type Ingredient = { id: string; name: string; category: string; baseUnit: string }
type Supplier = { id: string; name: string; contactPhone: string }
type Recipe = {
	dishId: string
	ingredients: Array<{ ingredientId: string; qtyPerServing: string }>
}

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

export const handleCatalog = {
	async dishesList(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: Dish[] }>(requireChatId(ctx), "/v1/dishes")
		if (data.items.length === 0) return { text: "No dishes in catalog." }
		const lines = data.items.map((d) => `• ${escapeMd(d.name)} (${d.category}) — ${d.servingUnit}`)
		return { text: `*Dishes*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async dishesCreate(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const name = String(entities.name ?? "").trim()
		if (name === "") return { text: "Tell me the dish name." }
		const body = {
			name,
			category: String(entities.category ?? "main"),
			servingUnit: String(entities.servingUnit ?? "plate"),
			avgServingWeightG: String(entities.avgServingWeightG ?? "200"),
			sellingPrice: String(entities.sellingPrice ?? "0"),
			costPerUnit: String(entities.costPerUnit ?? "0"),
			shelfLifeHours: Number(entities.shelfLifeHours ?? 24),
			isReusable: entities.isReusable === true,
			reuseRoute: String(entities.reuseRoute ?? "next_meal"),
		}
		const d = await callMain<Dish>(requireChatId(ctx), "/v1/dishes", { method: "POST", body })
		return { text: `Added ${escapeMd(d.name)}.` }
	},

	async ingredientsList(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: Ingredient[] }>(requireChatId(ctx), "/v1/ingredients")
		if (data.items.length === 0) return { text: "No ingredients yet." }
		const lines = data.items.map((i) => `• ${escapeMd(i.name)} (${i.category}) — ${i.baseUnit}`)
		return { text: `*Ingredients*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async ingredientsCreate(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const name = String(entities.name ?? "").trim()
		if (name === "") return { text: "Tell me the ingredient name." }
		const body = {
			name,
			category: String(entities.category ?? "produce"),
			baseUnit: String(entities.baseUnit ?? "kg"),
		}
		const i = await callMain<Ingredient>(requireChatId(ctx), "/v1/ingredients", {
			method: "POST",
			body,
		})
		return { text: `Added ${escapeMd(i.name)}.` }
	},

	async suppliersList(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: Supplier[] }>(requireChatId(ctx), "/v1/suppliers")
		if (data.items.length === 0) return { text: "No suppliers yet." }
		const lines = data.items.map((s) => `• ${escapeMd(s.name)} — ${escapeMd(s.contactPhone)}`)
		return { text: `*Suppliers*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async suppliersCreate(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const name = String(entities.name ?? "").trim()
		if (name === "") return { text: "Tell me the supplier name." }
		const body = {
			name,
			contactPhone: String(entities.contactPhone ?? ""),
		}
		const s = await callMain<Supplier>(requireChatId(ctx), "/v1/suppliers", {
			method: "POST",
			body,
		})
		return { text: `Added ${escapeMd(s.name)}.` }
	},

	async recipeGet(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.dishId ?? "").trim()
		if (id === "") return { text: "Tell me the dish id." }
		const r = await callMain<Recipe>(requireChatId(ctx), `/v1/dishes/${id}/recipe`)
		if (r.ingredients.length === 0) return { text: "No ingredients on this recipe." }
		const lines = r.ingredients.map((i) => `• ${i.ingredientId.slice(0, 8)}: ${i.qtyPerServing}`)
		return { text: `*Recipe*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async recipePut(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.dishId ?? "").trim()
		if (id === "") return { text: "Tell me the dish id." }
		const list = Array.isArray(entities.ingredients) ? entities.ingredients : []
		const ingredients = list.map((raw) => {
			const item = raw as Record<string, unknown>
			return {
				ingredientId: String(item.ingredientId ?? ""),
				qtyPerServing: String(item.qtyPerServing ?? "0"),
			}
		})
		await callMain(requireChatId(ctx), `/v1/dishes/${id}/recipe`, {
			method: "PUT",
			body: { ingredients },
		})
		return { text: `Saved recipe for ${id.slice(0, 8)}.` }
	},
}
