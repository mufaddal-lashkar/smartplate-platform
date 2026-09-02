import { type InlineKeyboardButton, InputFile } from "grammy/types"
import type { BotContext } from "./bot"
import { requireChatId } from "./bot"

export type Reply =
	| {
			text: string
			rows?: InlineKeyboardButton[][]
			parseMode?: "MarkdownV2" | "HTML"
			replyToMessageId?: number
	  }
	| {
			kind: "document"
			filename: string
			bytes: Uint8Array
			mimeType: string
			caption?: string
	  }

const isDocument = (reply: Reply): reply is Extract<Reply, { kind: "document" }> =>
	"kind" in reply && reply.kind === "document"

export const sendReply = async (ctx: BotContext, reply: Reply): Promise<number | null> => {
	if (isDocument(reply)) {
		const file = new InputFile(Buffer.from(reply.bytes), reply.filename)
		const sent = await ctx.replyWithDocument(file, {
			caption: reply.caption,
		})
		ctx.session.lastBotMessageId = sent.message_id
		return sent.message_id
	}
	const options: Parameters<typeof ctx.reply>[1] = {
		reply_markup: reply.rows == null ? undefined : { inline_keyboard: reply.rows },
		parse_mode: reply.parseMode,
		reply_to_message_id: reply.replyToMessageId,
	}
	const sent = await ctx.reply(reply.text, options)
	ctx.session.lastBotMessageId = sent.message_id
	return sent.message_id
}

export const editReply = async (
	ctx: BotContext,
	messageId: number,
	reply: Reply,
): Promise<void> => {
	if (isDocument(reply)) return
	await ctx.api.editMessageText(requireChatId(ctx), messageId, reply.text, {
		reply_markup: reply.rows == null ? undefined : { inline_keyboard: reply.rows },
		parse_mode: reply.parseMode,
	})
}

export const row = (buttons: InlineKeyboardButton[]): InlineKeyboardButton[] => buttons
export const btn = (label: string, data: string): InlineKeyboardButton => ({
	text: label,
	callback_data: data,
})

const MD2_RESERVED = /([_*[\]()~`>#+\-=|{}.!])/g

export const md2 = (text: string): string => text.replace(MD2_RESERVED, "\\$1")
