import { getSession } from "../../main-client"
import type { BotContext } from "../bot"
import { requireChatId } from "../bot"
import { btn, md2, row, sendReply } from "../reply"

export const callMenu = async (ctx: BotContext): Promise<void> => {
	const session = await getSession(requireChatId(ctx))
	if (session == null) {
		await sendReply(ctx, {
			text: "Link this chat first with /start <tenant-code> <email>.",
		})
		return
	}

	const read = row([btn("Stock", "act:inventory.stock"), btn("Expiring", "act:inventory.expiring")])
	const write = row([
		btn("Log purchase", "act:inventory.purchases.create"),
		btn("Adjust", "act:inventory.adjustments.create"),
	])
	const prep = row([
		btn("Log prep", "act:prep.create"),
		btn("Reuse pending", "act:prep.reuse_pending"),
	])
	const leftover = row([
		btn("Leftovers", "act:leftovers.list"),
		btn("Record leftover", "act:leftovers.record"),
	])
	const listings = row([
		btn("My listings", "act:listings.own"),
		btn("Browse market", "act:market.browse"),
	])
	const reports = row([
		btn("Dashboard", "act:analytics.dashboard"),
		btn("Generate report", "act:reports.create"),
	])
	const me = row([btn("Who am I", "act:auth.me"), btn("Logout", "act:auth.logout")])

	const rows = [read, write, prep, leftover, listings, reports, me]

	if (session.role === "ngo_admin" || session.role === "ngo_volunteer") {
		rows.splice(
			5,
			0,
			row([btn("Pickups", "act:market.pickups"), btn("My claims", "act:market.mine")]),
		)
	}
	if (session.role === "super_admin") {
		rows.splice(
			6,
			0,
			row([
				btn("Pending verifications", "act:admin.verification.queue"),
				btn("All tenants", "act:admin.tenants.list"),
			]),
		)
	}

	await sendReply(ctx, {
		text: `Menu for *${md2(session.role)}* \\(tenant ${md2(session.tenantId.slice(0, 8))}\\)\\. Tap an action, or send a free-form sentence\\.`,
		parseMode: "MarkdownV2",
		rows,
	})
}
