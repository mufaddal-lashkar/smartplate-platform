import dayjs from "dayjs"
import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { btn, row } from "../bot/reply"
import { clock, empty, esc, heading, italic, lines, money, qty, until } from "../format"
import { callMain } from "../main-client"
import { encodeAction, mintToken } from "../resolver"
import type { DispatchContext } from "./index"

const LIST_LIMIT = 10

type OwnListing = {
	id: string
	channel: "b2b" | "ngo"
	status: string
	pricePerUnit: string
	qty: string
	unit: string
	pickupUntil: string
	safeUntil: string
	claimedByTenantId: string | null
}

export const handleListings = {
	async own(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const data = await callMain<{ items: OwnListing[] }>(chatId, "/v1/listings")
		if (data.items.length === 0) {
			return {
				text: empty(
					"You have no listings.",
					"They appear when you sell or donate a leftover — send /leftovers.",
				),
			}
		}
		const now = dayjs()
		const blocks: string[] = []
		const keyboard = []
		for (const listing of data.items.slice(0, LIST_LIMIT)) {
			const price = listing.channel === "ngo" ? "Free" : `${money(listing.pricePerUnit)} each`
			blocks.push(
				lines([
					`<b>${qty(listing.qty, listing.unit)}</b> · ${price} · ${esc(listing.status)}`,
					`Pickup by ${clock(listing.pickupUntil)} · ${until(listing.safeUntil, now)}`,
				]),
			)
			if (listing.status === "open") {
				const token = await mintToken(chatId, { listingId: listing.id })
				keyboard.push(row([btn("Cancel listing", encodeAction("listings.cancel", token))]))
			}
			if (listing.status === "claimed") {
				const completeToken = await mintToken(chatId, { listingId: listing.id })
				const noShowToken = await mintToken(chatId, { listingId: listing.id })
				keyboard.push(
					row([
						btn("Mark collected", encodeAction("listings.complete", completeToken)),
						btn("Report no-show", encodeAction("listings.no_show", noShowToken)),
					]),
				)
			}
		}
		return {
			text: lines([heading("Your listings", data.items.length), "", blocks.join("\n\n")]),
			rows: keyboard,
		}
	},

	async patch(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const listingId = (entities.listingId ?? "").trim()
		const body: Record<string, string> = {}
		if ((entities.pricePerUnit ?? "") !== "") body.pricePerUnit = entities.pricePerUnit ?? ""
		if ((entities.pickupUntil ?? "") !== "") body.pickupUntil = entities.pickupUntil ?? ""
		if (Object.keys(body).length === 0) {
			return { text: esc("Tell me a new price or a new pickup time.") }
		}
		await callMain(requireChatId(ctx), `/v1/listings/${listingId}`, { method: "PATCH", body })
		return {
			text:
				body.pricePerUnit == null
					? esc("✅ Pickup window updated.")
					: `✅ Price is now ${money(body.pricePerUnit)}.`,
		}
	},

	async cancel(
		ctx: BotContext,
		entities: Record<string, string>,
		d: DispatchContext,
	): Promise<Reply> {
		const listingId = (entities.listingId ?? "").trim()
		await callMain(requireChatId(ctx), `/v1/listings/${listingId}/cancel`, {
			method: "POST",
			idempotencyKey: d.idempotencyKey,
		})
		return { text: esc("Listing cancelled. It's off the market.") }
	},

	async complete(
		ctx: BotContext,
		entities: Record<string, string>,
		d: DispatchContext,
	): Promise<Reply> {
		const listingId = (entities.listingId ?? "").trim()
		await callMain(requireChatId(ctx), `/v1/listings/${listingId}/complete`, {
			method: "POST",
			idempotencyKey: d.idempotencyKey,
		})
		return {
			text: lines([
				esc("✅ Marked collected."),
				italic("That surplus never became waste — it counts toward your recovery rate."),
			]),
		}
	},

	async noShow(
		ctx: BotContext,
		entities: Record<string, string>,
		d: DispatchContext,
	): Promise<Reply> {
		const listingId = (entities.listingId ?? "").trim()
		await callMain(requireChatId(ctx), `/v1/listings/${listingId}/no-show`, {
			method: "POST",
			idempotencyKey: d.idempotencyKey,
		})
		return { text: esc("No-show recorded. The listing is open again.") }
	},
}
