import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
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

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

const decisionFromEntity = (v: unknown): "approve" | "reject" | null => {
	if (v === "approve" || v === "approved" || v === "yes") return "approve"
	if (v === "reject" || v === "rejected" || v === "no") return "reject"
	return null
}

export const handleAdmin = {
	async tenantsList(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: AdminTenant[] }>(requireChatId(ctx), "/v1/admin/tenants")
		const lines = data.items.map(
			(t) => `• ${escapeMd(t.name)} (${t.type}) — ${t.verificationStatus}`,
		)
		return { text: `*Tenants*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async verificationQueue(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<{ items: AdminTenant[] }>(requireChatId(ctx), "/v1/admin/tenants")
		const pending = data.items.filter((t) => t.type === "ngo" && t.verificationStatus === "pending")
		if (pending.length === 0) return { text: "No NGOs awaiting verification." }
		const lines = pending.map((t) => `• ${escapeMd(t.name)} (${t.id.slice(0, 8)})`)
		return { text: `*Pending verifications*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},

	async verificationDecide(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.tenantId ?? "").trim()
		if (id === "") return { text: "Tell me the tenant id." }
		const decision = decisionFromEntity(entities.decision)
		if (decision == null) return { text: "Tell me approve or reject." }
		const rejectionReason = String(entities.rejectionReason ?? "")
		const body: { decision: "approve" | "reject"; rejectionReason?: string } = { decision }
		if (decision === "reject" && rejectionReason !== "") body.rejectionReason = rejectionReason
		await callMain(requireChatId(ctx), `/v1/admin/tenants/${id}/verify`, { method: "POST", body })
		return { text: `${decision === "approve" ? "Approved" : "Rejected"} ${id.slice(0, 8)}.` }
	},

	async analytics(
		ctx: BotContext,
		_e: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const data = await callMain<Record<string, unknown>>(requireChatId(ctx), "/v1/admin/analytics")
		const lines = Object.entries(data).map(([k, v]) => `• ${k}: ${String(v)}`)
		return { text: `*Platform analytics*\n${lines.join("\n")}`, parseMode: "MarkdownV2" }
	},
}
