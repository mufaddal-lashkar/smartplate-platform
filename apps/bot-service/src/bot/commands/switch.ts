import { logger } from "../../logger"
import { getSession } from "../../main-client"
import type { BotContext } from "../bot"
import { requireChatId } from "../bot"
import { sendReply } from "../reply"

export const callSwitch = async (ctx: BotContext): Promise<void> => {
	const session = await getSession(requireChatId(ctx))
	if (session == null) {
		await sendReply(ctx, { text: "Link this chat first with /start <tenant-code> <email>." })
		return
	}
	if (session.role !== "super_admin") {
		await sendReply(ctx, {
			text: "Only super admins can switch tenants in chat. Use the web app for tenant-specific actions.",
		})
		return
	}
	const text = ctx.message?.text ?? ""
	const match = text.match(/^\/switch\s+(\S+)/)
	if (match == null) {
		await sendReply(ctx, { text: "Usage: /switch <tenant-id>" })
		return
	}
	logger.info({ chatId: ctx.chatId, target: match[1] }, "super_admin switch requested")
	await sendReply(ctx, {
		text: "Tenant switching isn't wired in this build. The web app is the supported path for super admins right now.",
	})
}
