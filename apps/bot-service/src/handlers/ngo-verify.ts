import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { empty, esc, heading, lines } from "../format"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type AdminTenant = {
	id: string
	name: string
	type: string
	verified: boolean
	verificationStatus: string
	rejectionReason: string
}

const decisionFrom = (value: string): "approve" | "reject" | "" => {
	if (value === "approve" || value === "approved" || value === "yes") return "approve"
	if (value === "reject" || value === "rejected" || value === "no") return "reject"
	return ""
}

export const handleAdmin = {
	async tenantsList(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: AdminTenant[] }>(requireChatId(ctx), "/v1/admin/tenants")
		if (data.items.length === 0) return { text: empty("No tenants.", "") }
		const rows = data.items.map(
			(tenant) => `${esc(tenant.name)} · ${esc(tenant.type)} · ${esc(tenant.verificationStatus)}`,
		)
		return { text: lines([heading("All tenants", data.items.length), ...rows]) }
	},

	async verificationQueue(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: AdminTenant[] }>(requireChatId(ctx), "/v1/admin/tenants")
		const pending = data.items.filter(
			(tenant) => tenant.type === "ngo" && tenant.verificationStatus === "pending",
		)
		if (pending.length === 0) return { text: empty("No NGOs awaiting verification.", "") }
		const rows = pending.map((tenant) => `${esc(tenant.name)} · ${esc(tenant.id.slice(0, 8))}`)
		return { text: lines([heading("Pending verification", pending.length), ...rows]) }
	},

	async verificationDecide(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const tenantId = (entities.tenantId ?? "").trim()
		const decision = decisionFrom(entities.decision ?? "")
		if (decision === "") return { text: esc("Tell me approve or reject.") }
		const body: { decision: "approve" | "reject"; rejectionReason?: string } = { decision }
		const reason = (entities.rejectionReason ?? "").trim()
		if (decision === "reject" && reason !== "") body.rejectionReason = reason
		await callMain(requireChatId(ctx), `/v1/admin/tenants/${tenantId}/verify`, {
			method: "POST",
			body,
		})
		return {
			text: esc(`✅ ${decision === "approve" ? "Approved" : "Rejected"} ${tenantId.slice(0, 8)}.`),
		}
	},

	async analytics(
		ctx: BotContext,
		_e: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<Record<string, string | number>>(
			requireChatId(ctx),
			"/v1/admin/analytics",
		)
		const rows = Object.entries(data).map(([key, value]) => `${esc(key)} — ${esc(String(value))}`)
		return { text: lines([heading("Platform analytics", rows.length), ...rows]) }
	},
}
