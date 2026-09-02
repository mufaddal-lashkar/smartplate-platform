import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { callMain } from "../main-client"
import type { DispatchContext } from "./index"

type UserRow = {
	id: string
	email: string
	name: string
	role: "owner" | "staff" | "ngo_admin" | "ngo_volunteer"
	archived: boolean
}

const escapeMd = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`)

const validRole = (v: unknown): v is "owner" | "staff" | "ngo_admin" | "ngo_volunteer" =>
	v === "owner" || v === "staff" || v === "ngo_admin" || v === "ngo_volunteer"

export const handleUsers = {
	async list(ctx: BotContext, _e: Record<string, unknown>, _d: DispatchContext): Promise<Reply> {
		const data = await callMain<{ items: UserRow[] }>(requireChatId(ctx), "/v1/users")
		const lines = data.items.map(
			(u) => `• ${escapeMd(u.name)} (${u.email}) — ${u.role}${u.archived ? " [archived]" : ""}`,
		)
		return { text: `Team\n${lines.join("\n")}` }
	},

	async invite(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const email = String(entities.email ?? "").trim()
		const name = String(entities.name ?? "").trim()
		const role = String(entities.role ?? "staff")
		if (!email || !name) return { text: "Tell me email and name." }
		if (!validRole(role)) return { text: "Role must be owner, staff, ngo_admin, or ngo_volunteer." }
		const r = await callMain<UserRow>(requireChatId(ctx), "/v1/users", {
			method: "POST",
			body: { email, name, role },
		})
		return { text: `Invited ${escapeMd(r.name)} as ${r.role}.` }
	},

	async update(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.userId ?? "").trim()
		if (id === "") return { text: "Tell me the user id." }
		const body: { name?: string; role?: UserRow["role"] } = {}
		if (typeof entities.name === "string" && entities.name !== "") body.name = entities.name
		if (typeof entities.role === "string" && validRole(entities.role)) body.role = entities.role
		if (Object.keys(body).length === 0) return { text: "Tell me a name or role to change." }
		await callMain(requireChatId(ctx), `/v1/users/${id}`, { method: "PATCH", body })
		return { text: `Updated user ${id.slice(0, 8)}.` }
	},

	async archive(
		ctx: BotContext,
		entities: Record<string, unknown>,
		_d: DispatchContext,
	): Promise<Reply> {
		const id = String(entities.userId ?? "").trim()
		if (id === "") return { text: "Tell me the user id." }
		const archived = entities.archived !== false
		await callMain(requireChatId(ctx), `/v1/users/${id}`, {
			method: "DELETE",
			body: { archived },
		})
		return { text: `${archived ? "Archived" : "Unarchived"} ${id.slice(0, 8)}.` }
	},
}
