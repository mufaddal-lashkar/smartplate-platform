import { beforeAll, describe, expect, it } from "bun:test"
import { INTENTS } from "@smartplate/contracts/intents"
import type { Bot } from "grammy"
import type { UserFromGetMe } from "grammy/types"
import type { BotContext } from "../src/bot/bot"
import { createBot } from "../src/bot/bot"

type Captured = { method: string; payload: Record<string, string> }

const OWNER_CHAT = 990001
const NGO_CHAT = 990002

const BOT_INFO: UserFromGetMe = {
	id: 1,
	is_bot: true,
	first_name: "SmartPlate Test",
	username: "smartplate_test_bot",
	can_join_groups: true,
	can_read_all_group_messages: false,
	supports_inline_queries: false,
	can_connect_to_business: false,
	has_main_web_app: false,
}

const captured: Captured[] = []
let bot: Bot<BotContext>
let updateId = 100000

const texts = (frames: Captured[]): string =>
	frames
		.filter((frame) => frame.method === "sendMessage")
		.map((frame) => frame.payload.text ?? "")
		.join("\n")

const buttons = (frames: Captured[]): string[] =>
	frames.flatMap((frame) => {
		const markup = frame.payload.reply_markup
		if (markup == null) return []
		const parsed =
			typeof markup === "string"
				? (JSON.parse(markup) as { inline_keyboard: { callback_data: string }[][] })
				: (markup as unknown as { inline_keyboard: { callback_data: string }[][] })
		return parsed.inline_keyboard.flat().map((button) => button.callback_data)
	})

const send = async (text: string, chatId = OWNER_CHAT): Promise<Captured[]> => {
	captured.length = 0
	updateId += 1
	await bot.handleUpdate({
		update_id: updateId,
		message: {
			message_id: updateId,
			date: Math.floor(Date.now() / 1000),
			chat: { id: chatId, type: "private", first_name: "Tester" },
			from: { id: chatId, is_bot: false, first_name: "Tester" },
			text,
		},
	})
	return [...captured]
}

const tap = async (data: string, chatId = OWNER_CHAT): Promise<Captured[]> => {
	captured.length = 0
	updateId += 1
	await bot.handleUpdate({
		update_id: updateId,
		callback_query: {
			id: String(updateId),
			from: { id: chatId, is_bot: false, first_name: "Tester" },
			chat_instance: "1",
			data,
			message: {
				message_id: updateId,
				date: Math.floor(Date.now() / 1000),
				chat: { id: chatId, type: "private", first_name: "Tester" },
				text: "previous",
			},
		},
	})
	return [...captured]
}

beforeAll(async () => {
	bot = createBot(BOT_INFO)
	bot.api.config.use(async (_prev, method, payload) => {
		captured.push({ method, payload: payload as Record<string, string> })
		return {
			ok: true,
			result: {
				message_id: updateId,
				date: Math.floor(Date.now() / 1000),
				chat: { id: OWNER_CHAT, type: "private" },
			},
		} as never
	})
	await send("/start logout", OWNER_CHAT)
	await send("/start logout", NGO_CHAT)
})

describe("bot end-to-end against the live stack", () => {
	it("offers the persona picker on a first /start", async () => {
		const frames = await send("/start")
		expect(texts(frames)).toContain("Who are you today")
		expect(buttons(frames).filter((data) => data.startsWith("p:"))).toHaveLength(3)
	})

	it("binds Asha and welcomes her to Spice Route", async () => {
		const frames = await tap("p:asha")
		expect(texts(frames)).toContain("spice-route")
		expect(texts(frames)).toContain("owner")
	})

	it("renders a role-aware menu with a Kitchen section", async () => {
		const frames = await send("/menu")
		expect(texts(frames)).toContain("What would you like to do")
		expect(buttons(frames).some((data) => data.includes("inventory.stock"))).toBe(true)
	})

	it("reads real seeded stock with no undefined", async () => {
		const frames = await send("what do i have in stock")
		expect(texts(frames)).toContain("In stock")
		expect(texts(frames)).not.toContain("undefined")
	})

	it("lists today's leftovers with a disposition button", async () => {
		const frames = await send("show me leftovers")
		expect(texts(frames)).not.toContain("undefined")
		const hasButton = buttons(frames).some((data) => data.includes("leftovers.disposition_suggest"))
		const isEmpty = texts(frames).includes("No leftovers logged today")
		expect(hasButton || isEmpty).toBe(true)
	})

	it("renders the dashboard from the 90-day history", async () => {
		const frames = await send("dashboard")
		expect(texts(frames)).toContain("Recovery rate")
		expect(texts(frames)).not.toContain("undefined")
		expect(texts(frames)).not.toContain("NaN")
	})

	it("browses the seeded open listings with claim buttons for the NGO persona", async () => {
		await send("/start logout", NGO_CHAT)
		await send("/start", NGO_CHAT)
		await tap("p:ravi", NGO_CHAT)
		const frames = await send("browse the market", NGO_CHAT)
		const claimable = buttons(frames).some((data) => data.startsWith("a:market.claim:"))
		const isEmpty = texts(frames).includes("Nothing open nearby")
		expect(claimable || isEmpty).toBe(true)
	})

	it("asks for confirmation before a destructive action", async () => {
		const listFrames = await send("my listings")
		const cancel = buttons(listFrames).find((data) => data.startsWith("a:listings.cancel:"))
		if (cancel == null) {
			expect(texts(listFrames)).toContain("no listings")
			return
		}
		const confirmFrames = await tap(cancel)
		expect(texts(confirmFrames)).toContain("can't be undone")
		expect(buttons(confirmFrames).some((data) => data.startsWith("c:listings.cancel:"))).toBe(true)
	})

	it("gives a worked example rather than a dead end when a field is missing", async () => {
		const frames = await send("log some leftover paneer")
		expect(texts(frames)).toContain("Try:")
	})

	it("falls back to the list when an id-taking intent has no id", async () => {
		const frames = await send("browse the market")
		expect(texts(frames)).not.toContain("I didn't catch that")
	})

	it("rejects a stale callback token instead of acting on it", async () => {
		const frames = await tap("a:market.claim:zzzzzzzz")
		expect(texts(frames)).toContain("expired")
	})

	it("reaches every core intent through a command, a button or a list fallback", () => {
		const core = INTENTS.filter((entry) => entry.tier === "core")
		const unreachable = core.filter(
			(entry) =>
				entry.command === "" &&
				entry.buttonLabel === "" &&
				entry.listIntent === "" &&
				entry.example === "",
		)
		expect(unreachable).toEqual([])
	})
})
