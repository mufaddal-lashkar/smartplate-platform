import type { BotContext } from "../bot/bot"
import { requireChatId } from "../bot/bot"
import type { Reply } from "../bot/reply"
import { btn, row } from "../bot/reply"
import { empty, esc, heading, lines } from "../format"
import { callMain } from "../main-client"
import { encodeAction, mintToken } from "../resolver"
import type { DispatchContext } from "./index"

const LIST_LIMIT = 15

type UserRow = {
	id: string
	email: string
	name: string
	role: "owner" | "staff" | "ngo_admin" | "ngo_volunteer"
	archived: boolean
}

const isRole = (value: string): value is UserRow["role"] =>
	value === "owner" || value === "staff" || value === "ngo_admin" || value === "ngo_volunteer"

export const handleUsers = {
	async list(ctx: BotContext, _e: Record<string, string>, _d: DispatchContext): Promise<Reply> {
		const chatId = requireChatId(ctx)
		const data = await callMain<{ items: UserRow[] }>(chatId, "/v1/users")
		if (data.items.length === 0) {
			return { text: empty("No one on the team yet.", "Invite someone: invite a@b.com as staff") }
		}
		const rows: string[] = []
		const keyboard = []
		for (const user of data.items.slice(0, LIST_LIMIT)) {
			rows.push(
				`${esc(user.name)} · ${esc(user.email)} · ${esc(user.role)}${user.archived ? " (archived)" : ""}`,
			)
			if (user.archived) continue
			const permissionsToken = await mintToken(chatId, { userId: user.id })
			const archiveToken = await mintToken(chatId, { userId: user.id })
			keyboard.push(
				row([
					btn(
						`Permissions · ${user.name}`.slice(0, 60),
						encodeAction("permissions.list", permissionsToken),
					),
					btn(`Archive · ${user.name}`.slice(0, 60), encodeAction("users.archive", archiveToken)),
				]),
			)
		}
		return { text: lines([heading("Your team", data.items.length), ...rows]), rows: keyboard }
	},

	async invite(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const role = entities.role ?? "staff"
		if (!isRole(role)) {
			return { text: esc("Role must be owner, staff, ngo_admin or ngo_volunteer.") }
		}
		const created = await callMain<UserRow>(requireChatId(ctx), "/v1/users", {
			method: "POST",
			body: { email: (entities.email ?? "").trim(), name: (entities.name ?? "").trim(), role },
		})
		return { text: `✅ Invited ${esc(created.name)} as ${esc(created.role)}.` }
	},

	async update(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const userId = (entities.userId ?? "").trim()
		const body: Record<string, string> = {}
		if ((entities.name ?? "") !== "") body.name = entities.name ?? ""
		const role = entities.role ?? ""
		if (role !== "" && isRole(role)) body.role = role
		if (Object.keys(body).length === 0) {
			return { text: esc("Tell me a name or a role to change.") }
		}
		await callMain(requireChatId(ctx), `/v1/users/${userId}`, { method: "PATCH", body })
		return { text: esc("✅ Updated.") }
	},

	async archive(
		ctx: BotContext,
		entities: Record<string, string>,
		_d: DispatchContext,
	): Promise<Reply> {
		const userId = (entities.userId ?? "").trim()
		const archived = entities.archived !== "false"
		await callMain(requireChatId(ctx), `/v1/users/${userId}`, {
			method: "DELETE",
			body: { archived },
		})
		return { text: esc(archived ? "✅ Archived." : "✅ Restored.") }
	},
}
