import { config, PERSONAS } from "../../config"
import { redis } from "../../db"
import { bold, esc, italic, lines } from "../../format"
import { logger } from "../../logger"
import { bindChat, getSession, setTenantSession, unbindChat } from "../../main-client"
import { isValidTenantCode } from "../../parse-fallback"
import { encodeAction, mintToken } from "../../resolver"
import { registerTenant } from "../../sse-bridge"
import type { BotContext } from "../bot"
import { requireChatId } from "../bot"
import { btn, row, sendReply } from "../reply"

export const PERSONA_PREFIX = "p:"

export const personaData = (key: string): string => `${PERSONA_PREFIX}${key}`

export const linkChat = async (
	ctx: BotContext,
	chatId: number,
	tenantCode: string,
	email: string,
	blurb: string,
): Promise<void> => {
	try {
		const session = await bindChat(chatId, tenantCode, email)
		await setTenantSession(session.tenantId, session)
		await redis.sadd(`bot:tenant:${session.tenantId}:chats`, String(chatId))
		await registerTenant(session.tenantId)
		const token = await mintToken(chatId, {})
		await sendReply(ctx, {
			text: lines([
				`✅ You're signed in to ${bold(tenantCode)} as ${esc(session.role)}.`,
				blurb === "" ? "" : italic(blurb),
			]),
			rows: [row([btn("Show me the menu", encodeAction("menu", token))])],
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "I couldn't link this chat."
		logger.warn({ chatId, tenantCode, error: message }, "bind failed")
		await sendReply(ctx, {
			text: esc("I couldn't link this chat to that account. Send /start to pick a persona."),
		})
	}
}

export const bindPersona = async (ctx: BotContext, chatId: number, key: string): Promise<void> => {
	const persona = PERSONAS.find((entry) => entry.key === key)
	if (persona == null) {
		await sendReply(ctx, { text: esc("I don't know that persona. Send /start again.") })
		return
	}
	await linkChat(ctx, chatId, persona.tenantCode, persona.email, persona.blurb)
}

const showPicker = async (ctx: BotContext): Promise<void> => {
	await sendReply(ctx, {
		text: lines([
			bold("Who are you today?"),
			"",
			esc("Pick a persona and I'll sign this chat in as them."),
		]),
		rows: PERSONAS.map((persona) => row([btn(persona.label, personaData(persona.key))])),
	})
}

export const callStart = async (ctx: BotContext): Promise<void> => {
	const chatId = requireChatId(ctx)
	const text = ctx.message?.text ?? ""
	const arg = (text.match(/^\/start(?:\s+(.+))?/)?.[1] ?? "").trim()

	if (arg === "logout" || arg === "unbind") {
		const existing = await getSession(chatId)
		if (existing != null) {
			await redis.srem(`bot:tenant:${existing.tenantId}:chats`, String(chatId))
		}
		await unbindChat(chatId)
		await sendReply(ctx, { text: esc("You're unlinked. Send /start to pick a persona again.") })
		return
	}

	if (arg === "") {
		const existing = await getSession(chatId)
		if (existing != null) {
			await sendReply(ctx, {
				text: lines([
					esc(`You're already linked as ${existing.role}.`),
					italic("Send /menu to see what you can do, or /start logout to switch persona."),
				]),
			})
			return
		}
		await showPicker(ctx)
		return
	}

	const parts = arg.split(/\s+/)
	const tenantCode = parts[0] ?? ""
	const email = parts[1] ?? ""
	if (parts.length !== 2 || !isValidTenantCode(tenantCode) || !email.includes("@")) {
		await sendReply(ctx, {
			text: lines([
				esc("That didn't look like a tenant and email."),
				italic(`Try: /start ${config.defaultTenantCode} ${config.defaultTenantEmail}`),
			]),
		})
		return
	}

	await linkChat(ctx, chatId, tenantCode, email, "")
}
