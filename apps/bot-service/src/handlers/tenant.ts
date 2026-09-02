import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
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

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

export const handleTenant = {
	async get(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<Tenant>(requireChatId(ctx), "/v1/tenant")
		return {
			text: `${escapeMd(data.name)}\nType: ${data.type}\nVerified: ${data.verified ? "yes" : "no"}`,
		}
	},

	async update(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const name = String(entities.name ?? "").trim()
		if (name === "") return { text: "Tell me the new name." }
		const data = await callMain<Tenant>(requireChatId(ctx), "/v1/tenant", {
			method: "PATCH",
			body: { name },
		})
		return { text: `Renamed to ${escapeMd(data.name)}.` }
	},

	async restaurantGet(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const r = await callMain<Restaurant>(requireChatId(ctx), "/v1/restaurant")
		const lines = [
			`• Name: ${escapeMd(r.name)}`,
			`• City: ${escapeMd(r.city)}`,
			`• Cuisine: ${escapeMd(r.cuisineType)}`,
			`• Phone: ${escapeMd(r.contactPhone)}`,
			`• Radius: ${r.browseRadiusKm} km`,
		]
		return { text: `Restaurant\n${lines.join("\n")}` }
	},

	async restaurantUpdate(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const body: Record<string, string> = {}
		const fields = [
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
		for (const f of fields) {
			const v = entities[f]
			if (typeof v === "string" && v !== "") body[f] = v
		}
		if (Object.keys(body).length === 0) return { text: "Tell me at least one field to change." }
		const r = await callMain<Restaurant>(requireChatId(ctx), "/v1/restaurant", {
			method: "PATCH",
			body,
		})
		return { text: `Updated ${escapeMd(r.name)}.` }
	},
}

export const handleNgo = {
	async get(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const n = await callMain<Ngo>(requireChatId(ctx), "/v1/ngo")
		const lines = [
			`• Name: ${escapeMd(n.name)}`,
			`• Phone: ${escapeMd(n.contactPhone)}`,
			`• Active: ${n.activeFrom}–${n.activeTo}`,
			`• Service radius: ${n.serviceRadiusKm} km`,
			`• Verification: ${n.verificationStatus}`,
		]
		return { text: `NGO\n${lines.join("\n")}` }
	},

	async update(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const body: Record<string, string> = {}
		const fields = [
			"name",
			"contactPhone",
			"activeFrom",
			"activeTo",
			"serviceRadiusKm",
			"latitude",
			"longitude",
		] as const
		for (const f of fields) {
			const v = entities[f]
			if (typeof v === "string" && v !== "") body[f] = v
		}
		if (Object.keys(body).length === 0) return { text: "Tell me at least one field to change." }
		const n = await callMain<Ngo>(requireChatId(ctx), "/v1/ngo", { method: "PATCH", body })
		return { text: `Updated ${escapeMd(n.name)}.` }
	},

	async submitVerification(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const registrationNo = String(entities.registrationNo ?? "").trim()
		const contactName = String(entities.contactName ?? "").trim()
		const contactPhone = String(entities.contactPhone ?? "").trim()
		if (!registrationNo || !contactName || !contactPhone) {
			return { text: "I need registration number, contact name, and phone." }
		}
		const notes = String(entities.notes ?? "")
		await callMain(requireChatId(ctx), "/v1/ngo/verification", {
			method: "POST",
			body: { registrationNo, contactName, contactPhone, notes },
		})
		return { text: "Verification request submitted." }
	},
}
