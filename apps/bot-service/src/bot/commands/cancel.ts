import type { BotContext } from "../bot"
import { sendReply } from "../reply"

export const callCancel = async (ctx: BotContext): Promise<void> => {
	ctx.session.step = ""
	ctx.session.pending = {}
	await sendReply(ctx, { text: "Cancelled. Send /menu or write a new instruction." })
}
