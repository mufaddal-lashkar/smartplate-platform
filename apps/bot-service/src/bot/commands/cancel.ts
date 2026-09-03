import { esc } from "../../format"
import type { BotContext } from "../bot"
import { sendReply } from "../reply"

export const callCancel = async (ctx: BotContext): Promise<void> => {
	await sendReply(ctx, { text: esc("Nothing in progress. Send /menu or write an instruction.") })
}
