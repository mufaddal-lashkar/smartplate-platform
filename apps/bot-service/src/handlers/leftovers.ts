import dayjs from "dayjs"
import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { btn, row } from "../bot/reply"
import { empty, esc, heading, italic, lines, money, qty, until } from "../format"
import { callMain } from "../main-client"
import { encodeAction, mintToken } from "../resolver"
import type { DispatchContext } from "./index"
import { findDishIdByName } from "./prep"

const LIST_LIMIT = 12

type Leftover = {
	id: string
	dishId: string
	dishName: string
	qty: string
	unit: string
	storage: string
	safeUntil: string
}

type DispositionSuggestion = {
	leftoverId: string
	qty: number
	unit: string
	suggestedRetainQty: number
	suggestedSellQty: number
	suggestedDonateQty: number
	suggestedWasteQty: number
	suggestedPricePerUnit: number
	confidence: string
	basis: string
}

export const handleLeftovers = {
	async list(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const today = dayjs().format("YYYY-MM-DD")
		const data = await callMain<{ items: Leftover[] }>(
			chatId,
			`/v1/leftovers/?serviceDate=${today}`,
		)
		if (data.items.length === 0) {
			return {
				text: empty(
					"No leftovers logged today.",
					"Log one: leftover 4 plates of paneer butter masala",
				),
			}
		}
		const now = dayjs()
		const blocks: string[] = []
		const keyboard = []
		for (const item of data.items.slice(0, LIST_LIMIT)) {
			blocks.push(
				lines([
					`<b>${esc(item.dishName)}</b>`,
					`${qty(item.qty, item.unit)} · ${esc(item.storage)} · ${until(item.safeUntil, now)}`,
				]),
			)
			const token = await mintToken(chatId, { leftoverId: item.id })
			keyboard.push(
				row([
					btn(
						`What should I do with ${item.dishName}?`.slice(0, 60),
						encodeAction("leftovers.disposition_suggest", token),
					),
				]),
			)
		}
		return {
			text: lines([heading("Leftovers today", data.items.length), "", blocks.join("\n\n")]),
			rows: keyboard,
		}
	},

	async record(
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
		const unit = entities.unit ?? "plate"
		const created = await callMain<{ id: string }>(chatId, "/v1/leftovers/", {
			method: "POST",
			body: {
				dishId,
				qty: amount,
				unit,
				storage: entities.storage ?? "refrigerated",
				preparedAt: dayjs().toISOString(),
			},
			idempotencyKey: d.idempotencyKey,
		})
		const token = await mintToken(chatId, { leftoverId: created.id })
		return {
			text: lines([
				`✅ Recorded ${qty(amount, unit)} of ${esc(name)}.`,
				italic("I can suggest how to split it between reuse, sale and donation."),
			]),
			rows: [row([btn("What should I do?", encodeAction("leftovers.disposition_suggest", token))])],
		}
	},

	async dispositionSuggest(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const leftoverId = (entities.leftoverId ?? "").trim()
		const data = await callMain<DispositionSuggestion>(
			chatId,
			`/v1/leftovers/${leftoverId}/disposition-suggestion`,
		)
		const price = data.suggestedPricePerUnit
		const parts = [
			`♻️ Keep ${qty(data.suggestedRetainQty, data.unit)}`,
			`🏷 Sell ${qty(data.suggestedSellQty, data.unit)}${price > 0 ? ` at ${money(price)} each` : ""}`,
			`🤝 Donate ${qty(data.suggestedDonateQty, data.unit)}`,
		]
		const token = await mintToken(chatId, {
			dispositions: JSON.stringify([
				{
					leftoverId,
					retainQty: data.suggestedRetainQty,
					sellQty: data.suggestedSellQty,
					donateQty: data.suggestedDonateQty,
					wasteQty: data.suggestedWasteQty,
					sellPricePerUnit: price,
				},
			]),
		})
		return {
			text: lines([
				`<b>Suggested split</b> — confidence ${esc(data.confidence)}`,
				"",
				...parts,
				"",
				italic(data.basis),
			]),
			rows: [row([btn("Commit this split", encodeAction("leftovers.dispositions", token))])],
		}
	},

	async dispositions(
		ctx: BotContext,
		entities: Record<string, string>,
		d: DispatchContext,
	): Promise<Reply> {
		const raw = entities.dispositions ?? "[]"
		const parsed = JSON.parse(raw) as Array<Record<string, string | number>>
		if (parsed.length === 0) {
			return { text: esc("I need at least one leftover to decide on. Send /leftovers.") }
		}
		const allocations = parsed.map((item) => ({
			leftoverId: String(item.leftoverId ?? ""),
			retainQty: Number(item.retainQty ?? 0),
			sellQty: Number(item.sellQty ?? 0),
			donateQty: Number(item.donateQty ?? 0),
			wasteQty: Number(item.wasteQty ?? 0),
			sellPricePerUnit: Number(item.sellPricePerUnit ?? 0),
		}))
		await callMain(requireChatId(ctx), "/v1/leftovers/dispositions", {
			method: "POST",
			body: { allocations },
			idempotencyKey: d.idempotencyKey,
		})
		const selling = allocations.some((item) => item.sellQty > 0)
		return {
			text: lines([
				`✅ Committed ${allocations.length} decision${allocations.length === 1 ? "" : "s"}.`,
				italic(
					selling
						? "The B2B offer is live. If nobody takes it, I'll escalate it to nearby NGOs."
						: "Watch this chat — I'll tell you when something happens.",
				),
			]),
		}
	},
}
