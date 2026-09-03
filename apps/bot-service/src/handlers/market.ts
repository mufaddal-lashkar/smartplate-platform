import type { Dayjs } from "dayjs"
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

export type MarketListingRow = {
	id: string
	tenantId: string
	channel: "b2b" | "ngo"
	pricePerUnit: string
	qty: string
	unit: string
	pickupFrom: string
	pickupUntil: string
	safeUntil: string
	claimedByTenantId: string | null
	restaurantName: string
	restaurantCity: string
}

export const marketRow = (listing: MarketListingRow, now: Dayjs): string => {
	const price = listing.channel === "ngo" ? "Free" : `${money(listing.pricePerUnit)} each`
	const label = listing.channel === "ngo" ? "Donation" : "B2B"
	return lines([
		`<b>${esc(listing.restaurantName)}</b> · ${esc(listing.restaurantCity)}`,
		`${qty(listing.qty, listing.unit)} · ${price} · ${label}`,
		`Pickup by ${clock(listing.pickupUntil)} · ${until(listing.safeUntil, now)}`,
	])
}

const listView = async (
	ctx: BotContext,
	path: string,
	title: string,
	emptyMessage: string,
	emptyHint: string,
	actionIntent: string,
	actionLabel: (listing: MarketListingRow) => string,
): Promise<Reply> => {
	const chatId = requireChatId(ctx)
	const data = await callMain<{ items: MarketListingRow[] }>(chatId, path)
	if (data.items.length === 0) return { text: empty(emptyMessage, emptyHint) }
	const now = dayjs()
	const blocks: string[] = []
	const keyboard = []
	for (const listing of data.items.slice(0, LIST_LIMIT)) {
		blocks.push(marketRow(listing, now))
		const token = await mintToken(chatId, { listingId: listing.id })
		keyboard.push(row([btn(actionLabel(listing), encodeAction(actionIntent, token))]))
	}
	return {
		text: lines([heading(title, data.items.length), "", blocks.join("\n\n")]),
		rows: keyboard,
	}
}

export const handleMarket = {
	async browse(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		return listView(
			ctx,
			"/v1/market",
			"Open near you",
			"Nothing open nearby right now.",
			"I'll message you the moment something is listed.",
			"market.claim",
			(listing) => `Claim ${qty(listing.qty, listing.unit)}`,
		)
	},

	async mine(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		return listView(
			ctx,
			"/v1/market/mine",
			"Your claims",
			"You haven't claimed anything yet.",
			"Send /market to see what's open.",
			"market.release",
			() => "Release claim",
		)
	},

	async pickups(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		return listView(
			ctx,
			"/v1/market/pickups",
			"Scheduled pickups",
			"No pickups scheduled.",
			"Send /market to claim something.",
			"listings.complete",
			() => "Picked it up",
		)
	},

	async claim(
		ctx: BotContext,
		entities: Record<string, string>,
		d: DispatchContext,
	): Promise<Reply> {
		const listingId = (entities.listingId ?? "").trim()
		const result = await callMain<{ data: { listing: MarketListingRow } }>(
			requireChatId(ctx),
			`/v1/market/${listingId}/claim`,
			{ method: "POST", idempotencyKey: d.idempotencyKey },
		)
		const listing = result.data.listing
		return {
			text: lines([
				`✅ Claimed ${qty(listing.qty, listing.unit)} from ${esc(listing.restaurantName)}.`,
				italic(`Collect it by ${clock(listing.pickupUntil)}.`),
			]),
		}
	},

	async release(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const listingId = (entities.listingId ?? "").trim()
		await callMain(requireChatId(ctx), `/v1/market/${listingId}/release`, { method: "POST" })
		return { text: esc("Released — it's back on the market for someone else.") }
	},
}
