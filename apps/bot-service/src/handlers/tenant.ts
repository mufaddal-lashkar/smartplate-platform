import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { bold, esc, lines } from "../format"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type Tenant = { id: string; name: string; type: string; verified: boolean }

type Restaurant = {
	id: string
	name: string
	addressLine: string
	city: string
	state: string
	pinCode: string
	cuisineType: string
	contactPhone: string
	browseRadiusKm: string
}

type Ngo = {
	id: string
	name: string
	contactPhone: string
	activeFrom: string
	activeTo: string
	serviceRadiusKm: string
	verificationStatus: string
}

const RESTAURANT_FIELDS = [
	"name",
	"addressLine",
	"city",
	"state",
	"pinCode",
	"cuisineType",
	"gstNumber",
	"contactPhone",
	"logoUrl",
	"browseRadiusKm",
	"latitude",
	"longitude",
] as const

const NGO_FIELDS = [
	"name",
	"contactPhone",
	"activeFrom",
	"activeTo",
	"serviceRadiusKm",
	"latitude",
	"longitude",
] as const

const pick = (entities: Record<string, string>, fields: readonly string[]) => {
	const body: Record<string, string> = {}
	for (const field of fields) {
		const value = entities[field] ?? ""
		if (value !== "") body[field] = value
	}
	return body
}

export const handleTenant = {
	async get(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<Tenant>(requireChatId(ctx), "/v1/tenant")
		return {
			text: lines([
				bold(data.name),
				`Type — ${esc(data.type)}`,
				`Verified — ${data.verified ? "yes" : "no"}`,
			]),
		}
	},

	async update(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const name = (entities.name ?? "").trim()
		const data = await callMain<Tenant>(requireChatId(ctx), "/v1/tenant", {
			method: "PATCH",
			body: { name },
		})
		return { text: `✅ Renamed to ${bold(data.name)}.` }
	},

	async restaurantGet(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<Restaurant>(requireChatId(ctx), "/v1/restaurant")
		return {
			text: lines([
				bold(data.name),
				`City — ${esc(data.city)}`,
				`Cuisine — ${esc(data.cuisineType)}`,
				`Phone — ${esc(data.contactPhone)}`,
				`Browse radius — ${esc(data.browseRadiusKm)} km`,
			]),
		}
	},

	async restaurantUpdate(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const body = pick(entities, RESTAURANT_FIELDS)
		if (Object.keys(body).length === 0) {
			return { text: esc("Tell me at least one field to change.") }
		}
		const data = await callMain<Restaurant>(requireChatId(ctx), "/v1/restaurant", {
			method: "PATCH",
			body,
		})
		return { text: `✅ Updated ${bold(data.name)}.` }
	},
}

export const handleNgo = {
	async get(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<Ngo>(requireChatId(ctx), "/v1/ngo")
		return {
			text: lines([
				bold(data.name),
				`Phone — ${esc(data.contactPhone)}`,
				`Active — ${esc(data.activeFrom)} to ${esc(data.activeTo)}`,
				`Service radius — ${esc(data.serviceRadiusKm)} km`,
				`Verification — ${esc(data.verificationStatus)}`,
			]),
		}
	},

	async update(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const body = pick(entities, NGO_FIELDS)
		if (Object.keys(body).length === 0) {
			return { text: esc("Tell me at least one field to change.") }
		}
		const data = await callMain<Ngo>(requireChatId(ctx), "/v1/ngo", { method: "PATCH", body })
		return { text: `✅ Updated ${bold(data.name)}.` }
	},

	async submitVerification(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		await callMain(requireChatId(ctx), "/v1/ngo/verification", {
			method: "POST",
			body: {
				registrationNo: (entities.registrationNo ?? "").trim(),
				contactName: (entities.contactName ?? "").trim(),
				contactPhone: (entities.contactPhone ?? "").trim(),
				notes: entities.notes ?? "",
			},
		})
		return { text: esc("✅ Verification request submitted. An admin will review it.") }
	},
}
