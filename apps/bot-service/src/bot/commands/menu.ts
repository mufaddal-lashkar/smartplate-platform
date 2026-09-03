import type { RoleValue, TenantTypeValue } from "@smartplate/contracts/auth"
import { type IntentSpec, menuSections } from "@smartplate/contracts/intents"
import type { InlineKeyboardButton } from "grammy/types"
import { bold, esc, italic, lines } from "../../format"
import { getSession } from "../../main-client"
import { encodeAction, mintToken } from "../../resolver"
import type { BotContext } from "../bot"
import type { Reply } from "../reply"
import { btn, row, sendReply } from "../reply"

const chunkOf = (specs: IntentSpec[], size: number): IntentSpec[][] => {
	const out: IntentSpec[][] = []
	for (let index = 0; index < specs.length; index += size) {
		out.push(specs.slice(index, index + size))
	}
	return out
}

export const menuRows = async (
	chatId: number,
	role: RoleValue,
	tenantType: TenantTypeValue,
): Promise<InlineKeyboardButton[][]> => {
	const rows: InlineKeyboardButton[][] = []
	for (const group of menuSections(role, tenantType)) {
		rows.push(row([btn(`— ${group.section} —`, "noop")]))
		for (const chunk of chunkOf(group.specs, 2)) {
			const buttons: InlineKeyboardButton[] = []
			for (const entry of chunk) {
				const token = await mintToken(chatId, {})
				buttons.push(btn(entry.buttonLabel, encodeAction(entry.intent, token)))
			}
			rows.push(buttons)
		}
	}
	const helpToken = await mintToken(chatId, {})
	rows.push(row([btn("How do I log things?", encodeAction("help", helpToken))]))
	return rows
}

export const menuReply = async (chatId: number): Promise<Reply> => {
	const session = await getSession(chatId)
	if (session == null) return { text: esc("Send /start to link this chat first.") }
	return {
		text: lines([
			bold("What would you like to do?"),
			italic(`Signed in as ${session.role}. You can also just type an instruction.`),
		]),
		rows: await menuRows(chatId, session.role as RoleValue, session.tenantType),
	}
}

export const callMenu = async (ctx: BotContext): Promise<void> => {
	await sendReply(ctx, await menuReply(ctx.chatId ?? 0))
}
