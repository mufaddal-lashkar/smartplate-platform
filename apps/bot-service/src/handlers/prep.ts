import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type Dish = { id: string; name: string; servingUnit: string }
type Leftover = {
	id: string
	dishId: string
	dishName: string
	qty: string
	unit: string
	safeUntil: string
}

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

const todayIso = () => {
	const d = new Date()
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, "0")
	const day = String(d.getDate()).padStart(2, "0")
	return `${y}-${m}-${day}`
}

const findDishIdByName = async (ctx: BotContext, name: string): Promise<string | null> => {
	const data = await callMain<{ items: Dish[] }>(requireChatId(ctx), "/v1/dishes")
	const target = name.toLowerCase().trim()
	const hit = data.items.find((d) => d.name.toLowerCase() === target)
	return hit?.id ?? data.items.find((d) => d.name.toLowerCase().includes(target))?.id ?? null
}

export const handlePrep = {
	async create(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const name = String(entities.dish ?? "").trim()
		if (name === "") return { text: "Tell me the dish, e.g. 'prepped 2 kg rice for lunch'." }
		const dishId = await findDishIdByName(ctx, name)
		if (dishId == null) return { text: `I don't see a dish called "${name}". Add it first.` }
		const qty = Number(entities.qty ?? 0)
		if (!Number.isFinite(qty) || qty <= 0) return { text: "Tell me a positive quantity." }
		const mealPeriod = String(entities.mealPeriod ?? "lunch")
		const serviceDate = String(entities.serviceDate ?? todayIso())
		await callMain(requireChatId(ctx), "/v1/prep-entries", {
			method: "POST",
			body: { dishId, qtyPrepared: qty, mealPeriod, serviceDate, covers: 0 },
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Logged prep of ${qty} ${escapeMd(name)} for ${mealPeriod} on ${serviceDate}.` }
	},

	async reusePending(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: Leftover[] }>(
			requireChatId(ctx),
			"/v1/leftovers/reuse-pending",
		)
		if (data.items.length === 0) return { text: "No pending reuse." }
		const lines = data.items.map((l) => `• ${escapeMd(l.dishName)} — ${l.qty} ${l.unit}`)
		return { text: `*Pending reuse*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async reuseConfirm(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const leftoverId = String(entities.leftoverId ?? "").trim()
		if (leftoverId === "") return { text: "Tell me the leftover id." }
		const reusedQty = Number(entities.reusedQty ?? 0)
		if (!Number.isFinite(reusedQty) || reusedQty <= 0)
			return { text: "Tell me a positive quantity." }
		const notes = String(entities.notes ?? "")
		await callMain(requireChatId(ctx), `/v1/leftovers/${leftoverId}/reuse-confirmation`, {
			method: "POST",
			body: { confirmedReusedQty: reusedQty, notes },
		})
		return { text: `Confirmed ${reusedQty} reused for ${leftoverId.slice(0, 8)}.` }
	},
}
