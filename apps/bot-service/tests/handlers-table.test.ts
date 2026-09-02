import { describe, expect, it } from "bun:test"
import type { BotContext } from "../src/bot/bot"
import { dispatchIntent } from "../src/handlers"

const makeCtx = (): BotContext => {
	return {
		chatId: 1,
		update: { update_id: 1 } as BotContext["update"],
		message: { text: "noop" } as BotContext["message"],
		session: { step: "", pending: {}, lastBotMessageId: 0 },
	} as BotContext
}

describe("dispatchIntent", () => {
	it("returns a friendly message for unknown intent", async () => {
		const reply = await dispatchIntent(
			makeCtx(),
			"definitely.not.a.real.intent",
			{},
			{
				idempotencyKey: "k1",
			},
		)
		expect(reply.text).toContain("I don't know how to handle that")
	})

	it("handles help and menu via static table entries", async () => {
		const help = await dispatchIntent(makeCtx(), "help", {}, { idempotencyKey: "k2" })
		expect(help.text).toContain("/menu")
		const menu = await dispatchIntent(makeCtx(), "menu", {}, { idempotencyKey: "k3" })
		expect(menu.text).toContain("/menu")
	})
})
