import dayjs from "dayjs"
import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { btn, row } from "../bot/reply"
import { empty, esc, heading, italic, lines, qty, until } from "../format"
import { callMain } from "../main-client"
import { encodeAction, mintToken } from "../resolver"
import type { DispatchContext } from "./index"

const LIST_LIMIT = 15

type Dish = { id: string; name: string; servingUnit: string }

type ReusePending = {
	leftoverId: string
	leftoverQty: number
	unit: string
	retainQty: number
	dishName: string
	dishId: string
	safeUntil: string
	preparedAt: string
}

export const findDishIdByName = async (ctx: BotContext, name: string): Promise<string> => {
	const data = await callMain<{ items: Dish[] }>(requireChatId(ctx), "/v1/dishes")
	const target = name.toLowerCase().trim()
	const exact = data.items.find((dish) => dish.name.toLowerCase() === target)
	if (exact != null) return exact.id
	return data.items.find((dish) => dish.name.toLowerCase().includes(target))?.id ?? ""
}

export const handlePrep = {
	async create(
		ctx: BotContext,
		entities: Record<string, string>,
		d: DispatchContext,
	): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const name = (entities.dish ?? "").trim()
		const dishId = await findDishIdByName(ctx, name)
		if (dishId === "") {
			return {
				text: lines([
					esc(`I don't have a dish called "${name}".`),
					italic("Add it first: add dish paneer butter masala, plate, 220"),
				]),
			}
		}
		const amount = Number(entities.qty)
		if (!Number.isFinite(amount) || amount <= 0) {
			return { text: esc("Tell me a positive quantity.") }
		}
		const mealPeriod = entities.mealPeriod ?? "lunch"
		const serviceDate = entities.serviceDate ?? dayjs().format("YYYY-MM-DD")
		await callMain(chatId, "/v1/prep-entries", {
			method: "POST",
			body: { dishId, qtyPrepared: amount, mealPeriod, serviceDate, covers: 0 },
			idempotencyKey: d.idempotencyKey,
		})
		return {
			text: lines([
				`✅ Logged ${amount} of ${esc(name)} for ${esc(mealPeriod)} on ${esc(serviceDate)}.`,
				italic("Tell me about any leftovers at the end of service."),
			]),
		}
	},

	async reusePending(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const data = await callMain<{ items: ReusePending[] }>(chatId, "/v1/leftovers/reuse-pending")
		if (data.items.length === 0) {
			return { text: empty("Nothing waiting on a reuse confirmation.", "") }
		}
		const now = dayjs()
		const rows: string[] = []
		const keyboard = []
		for (const item of data.items.slice(0, LIST_LIMIT)) {
			rows.push(
				lines([
					`<b>${esc(item.dishName)}</b>`,
					`${qty(item.retainQty, item.unit)} retained of ${qty(item.leftoverQty, item.unit)} · ${until(item.safeUntil, now)}`,
				]),
			)
			const token = await mintToken(chatId, {
				leftoverId: item.leftoverId,
				reusedQty: String(item.retainQty),
			})
			keyboard.push(
				row([
					btn(
						`Confirm ${qty(item.retainQty, item.unit)} reused`,
						encodeAction("prep.reuse_confirm", token),
					),
				]),
			)
		}
		return {
			text: lines([heading("Waiting on reuse", data.items.length), "", rows.join("\n\n")]),
			rows: keyboard,
		}
	},

	async reuseConfirm(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const leftoverId = (entities.leftoverId ?? "").trim()
		const reusedQty = Number(entities.reusedQty)
		if (!Number.isFinite(reusedQty) || reusedQty <= 0) {
			return { text: esc("Tell me a positive quantity.") }
		}
		await callMain(requireChatId(ctx), `/v1/leftovers/${leftoverId}/reuse-confirmation`, {
			method: "POST",
			body: { confirmedReusedQty: reusedQty, notes: entities.notes ?? "" },
		})
		return { text: `✅ Confirmed ${reusedQty} reused — that's surplus that never became waste.` }
	},
}
