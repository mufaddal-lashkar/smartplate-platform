import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type MarketListing = {
	id: string
	tenantId: string
	channel: "b2b" | "ngo"
	pricePerUnit: string
	qty: string
	unit: "kg" | "plate" | "piece" | "litre"
	pickupFrom: string
	pickupUntil: string
	safeUntil: string
	claimedByTenantId: string | null
	restaurantName: string
	restaurantCity: string
}

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

const fmt = (l: MarketListing) =>
	`• ${escapeMd(l.restaurantName)} (${escapeMd(l.restaurantCity)}) — ${l.qty} ${l.unit} @ ${l.pricePerUnit} [${l.channel}]`

export const handleMarket = {
	async browse(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: MarketListing[] }>(requireChatId(ctx), "/v1/market")
		if (data.items.length === 0) return { text: "No listings nearby." }
		return { text: `Market\n${data.items.map(fmt).join("\n")}` }
	},

	async mine(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: MarketListing[] }>(requireChatId(ctx), "/v1/market/mine")
		if (data.items.length === 0) return { text: "No claims yet." }
		return { text: `My claims\n${data.items.map(fmt).join("\n")}` }
	},

	async claim(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.listingId ?? "").trim()
		if (id === "") return { text: "Tell me the listing id to claim." }
		await callMain(requireChatId(ctx), `/v1/market/${id}/claim`, {
			method: "POST",
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Claimed listing ${id.slice(0, 8)}.` }
	},

	async release(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.listingId ?? "").trim()
		if (id === "") return { text: "Tell me the listing id to release." }
		await callMain(requireChatId(ctx), `/v1/market/${id}/release`, { method: "POST" })
		return { text: `Released listing ${id.slice(0, 8)}.` }
	},

	async pickups(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: MarketListing[] }>(
			requireChatId(ctx),
			"/v1/market/pickups",
		)
		if (data.items.length === 0) return { text: "No pickups scheduled." }
		return { text: `Pickups\n${data.items.map(fmt).join("\n")}` }
	},
}
