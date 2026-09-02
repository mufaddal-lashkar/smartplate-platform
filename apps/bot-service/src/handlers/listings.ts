import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type Listing = {
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

const fmt = (l: Listing) =>
	`• ${escapeMd(l.restaurantName)} (${escapeMd(l.restaurantCity)}) — ${l.qty} ${l.unit} @ ${l.pricePerUnit} until ${l.pickupUntil}`

export const handleListings = {
	async own(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: Listing[] }>(requireChatId(ctx), "/v1/listings")
		if (data.items.length === 0) return { text: "No active listings." }
		return { text: `My listings\n${data.items.map(fmt).join("\n")}` }
	},

	async patch(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.listingId ?? "").trim()
		if (id === "") return { text: "Tell me the listing id." }
		const body: { pricePerUnit?: string; pickupUntil?: string } = {}
		if (entities.pricePerUnit != null) body.pricePerUnit = String(entities.pricePerUnit)
		if (entities.pickupUntil != null) body.pickupUntil = String(entities.pickupUntil)
		if (Object.keys(body).length === 0)
			return { text: "Tell me a price or pickup-until to change." }
		await callMain(requireChatId(ctx), `/v1/listings/${id}`, { method: "PATCH", body })
		return { text: `Updated listing ${id.slice(0, 8)}.` }
	},

	async cancel(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.listingId ?? "").trim()
		if (id === "") return { text: "Tell me the listing id." }
		await callMain(requireChatId(ctx), `/v1/listings/${id}/cancel`, {
			method: "POST",
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Cancelled listing ${id.slice(0, 8)}.` }
	},

	async complete(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.listingId ?? "").trim()
		if (id === "") return { text: "Tell me the listing id." }
		await callMain(requireChatId(ctx), `/v1/listings/${id}/complete`, {
			method: "POST",
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Completed listing ${id.slice(0, 8)}.` }
	},

	async noShow(
		ctx: BotContext,
		entities: Record<string, unknown>,
		d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.listingId ?? "").trim()
		if (id === "") return { text: "Tell me the listing id." }
		await callMain(requireChatId(ctx), `/v1/listings/${id}/no-show`, {
			method: "POST",
			idempotencyKey: d.idempotencyKey,
		})
		return { text: `Reported no-show for ${id.slice(0, 8)}.` }
	},
}
