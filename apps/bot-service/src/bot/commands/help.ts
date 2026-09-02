import type { BotContext } from "../bot"
import { sendReply } from "../reply"

export const callHelp = async (ctx: BotContext): Promise<void> => {
	await sendReply(ctx, {
		text: [
			"*SmartPlate bot*",
			"",
			"• /start \\<tenant\\> \\<email\\> — link this chat to your account",
			"• /start logout — unlink this chat",
			"• /menu — pick an action from a list",
			"• /switch \\<tenant\\_id\\> — super\\-admin only: change tenant",
			"• /cancel — abort the current step",
			"• free\\-form messages are routed via Gemini; if Gemini is offline I use a keyword fallback\\.",
		].join("\n"),
		parseMode: "MarkdownV2",
	})
}
