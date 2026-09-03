import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { btn, row } from "../bot/reply"
import { empty, esc, heading, lines, truncate } from "../format"
import { callMain } from "../main-client"
import { encodeAction, mintToken } from "../resolver"
import type { DispatchContext } from "./index"

const LIST_LIMIT = 20

type Dish = { id: string; name: string; category: string; servingUnit: string }
type Ingredient = { id: string; name: string; category: string; baseUnit: string }
type Supplier = { id: string; name: string; contactPhone: string }
type Recipe = {
	dishId: string
	ingredients: Array<{ ingredientId: string; qtyPerServing: string }>
}

export const handleCatalog = {
	async dishesList(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const data = await callMain<{ items: Dish[] }>(chatId, "/v1/dishes")
		if (data.items.length === 0) {
			return { text: empty("No dishes yet.", "Add one: add dish paneer butter masala, plate, 220") }
		}
		const rows: string[] = []
		const keyboard = []
		for (const dish of data.items.slice(0, LIST_LIMIT)) {
			rows.push(`${esc(dish.name)} · ${esc(dish.category)} · ${esc(dish.servingUnit)}`)
			if (keyboard.length >= 8) continue
			const token = await mintToken(chatId, { dishId: dish.id })
			keyboard.push(
				row([btn(`Recipe · ${dish.name}`.slice(0, 60), encodeAction("catalog.recipe.get", token))]),
			)
		}
		return {
			text: lines([heading("Dishes", data.items.length), truncate(rows, LIST_LIMIT, "/dishes")]),
			rows: keyboard,
		}
	},

	async dishesCreate(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const created = await callMain<Dish>(requireChatId(ctx), "/v1/dishes", {
			method: "POST",
			body: {
				name: (entities.name ?? "").trim(),
				category: entities.category ?? "main",
				servingUnit: entities.servingUnit ?? "plate",
				avgServingWeightG: entities.avgServingWeightG ?? "200",
				sellingPrice: entities.sellingPrice ?? "0",
				costPerUnit: entities.costPerUnit ?? "0",
				shelfLifeHours: Number(entities.shelfLifeHours ?? "24") || 24,
				isReusable: entities.isReusable === "true",
				reuseRoute: entities.reuseRoute ?? "next_meal",
			},
		})
		return { text: `✅ Added ${esc(created.name)}.` }
	},

	async ingredientsList(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: Ingredient[] }>(requireChatId(ctx), "/v1/ingredients")
		if (data.items.length === 0) {
			return { text: empty("No ingredients yet.", "Add one: add ingredient basmati rice, kg") }
		}
		const rows = data.items.map(
			(item) => `${esc(item.name)} · ${esc(item.category)} · ${esc(item.baseUnit)}`,
		)
		return {
			text: lines([
				heading("Ingredients", data.items.length),
				truncate(rows, LIST_LIMIT, "/ingredients"),
			]),
		}
	},

	async ingredientsCreate(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const created = await callMain<Ingredient>(requireChatId(ctx), "/v1/ingredients", {
			method: "POST",
			body: {
				name: (entities.name ?? "").trim(),
				category: entities.category ?? "produce",
				baseUnit: entities.baseUnit ?? "kg",
			},
		})
		return { text: `✅ Added ${esc(created.name)}.` }
	},

	async suppliersList(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: Supplier[] }>(requireChatId(ctx), "/v1/suppliers")
		if (data.items.length === 0) {
			return {
				text: empty("No suppliers yet.", "Add one: add supplier Krishna Traders, +91-90000"),
			}
		}
		const rows = data.items.map((item) => `${esc(item.name)} · ${esc(item.contactPhone)}`)
		return {
			text: lines([heading("Suppliers", data.items.length), truncate(rows, LIST_LIMIT, "")]),
		}
	},

	async suppliersCreate(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const created = await callMain<Supplier>(requireChatId(ctx), "/v1/suppliers", {
			method: "POST",
			body: {
				name: (entities.name ?? "").trim(),
				contactPhone: entities.contactPhone ?? "",
			},
		})
		return { text: `✅ Added ${esc(created.name)}.` }
	},

	async recipeGet(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const dishId = (entities.dishId ?? "").trim()
		const recipe = await callMain<Recipe>(requireChatId(ctx), `/v1/dishes/${dishId}/recipe`)
		if (recipe.ingredients.length === 0) {
			return { text: empty("No ingredients on this recipe yet.", "") }
		}
		const rows = recipe.ingredients.map(
			(item) => `${esc(item.ingredientId.slice(0, 8))} — ${esc(item.qtyPerServing)} per serving`,
		)
		return { text: lines([heading("Recipe", recipe.ingredients.length), ...rows]) }
	},

	async recipePut(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const dishId = (entities.dishId ?? "").trim()
		const parsed = JSON.parse(entities.ingredients ?? "[]") as Array<Record<string, string>>
		const ingredients = parsed.map((item) => ({
			ingredientId: String(item.ingredientId ?? ""),
			qtyPerServing: String(item.qtyPerServing ?? "0"),
		}))
		await callMain(requireChatId(ctx), `/v1/dishes/${dishId}/recipe`, {
			method: "PUT",
			body: { ingredients },
		})
		return { text: `✅ Saved ${ingredients.length} recipe line(s).` }
	},
}
