import type { RoleValue } from "@smartplate/contracts/auth"
import dayjs from "dayjs"
import type { InlineKeyboardButton } from "grammy/types"
import { config } from "./config"
import { redis } from "./db"
import { bold, italic, lines, qty } from "./format"
import { type MarketListingRow, marketRow } from "./handlers/market"
import { readReportChat } from "./handlers/reports"
import { logger } from "./logger"
import { callMain, getSession, getTenantSession } from "./main-client"
import { encodeAction, mintToken } from "./resolver"

const RECONNECT_MS = [1000, 2000, 4000, 8000, 16000, 30000, 60000]
const HEARTBEAT_TIMEOUT_MS = 60_000

export type BridgeEvent = {
	name: string
	data: Record<string, string | number>
}

export type Card = {
	text: string
	rows: InlineKeyboardButton[][]
}

export type SseBridgeOptions = {
	sendMessage: (chatId: number, card: Card) => Promise<void>
	sendReport: (chatId: number, reportId: string) => Promise<void>
}

const bindingKey = (tenantId: string) => `bot:tenant:${tenantId}:chats`

let bridgeOptions: SseBridgeOptions | null = null
const connected = new Set<string>()

export const listBoundChats = async (tenantId: string): Promise<number[]> => {
	const ids = await redis.smembers(bindingKey(tenantId))
	return ids.map((id) => Number.parseInt(id, 10)).filter((id) => Number.isFinite(id))
}

const backoff = (attempt: number): number =>
	RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)] ?? 60000

export const parseFrame = (raw: string): BridgeEvent | null => {
	let name = ""
	let data = ""
	for (const line of raw.split("\n")) {
		if (line.startsWith(":")) continue
		if (line.startsWith("event: ")) name = line.slice("event: ".length).trim()
		else if (line.startsWith("data: ")) data = line.slice("data: ".length).trim()
	}
	if (name === "" || data === "") return null
	return { name, data: JSON.parse(data) as Record<string, string | number> }
}

const CLAIM_ROLES = new Set<string>(["owner", "ngo_admin"])

export const canClaim = (role: RoleValue): boolean => CLAIM_ROLES.has(role)

export const formatEvent = (event: BridgeEvent): Card => {
	switch (event.name) {
		case "listing.created":
			return { text: lines([bold("🍲 New offer nearby")]), rows: [] }
		case "listing.escalated":
			return { text: lines([bold("🤝 Surplus needs a home")]), rows: [] }
		case "listing.claimed":
			return {
				text: lines([
					bold("✅ Your listing was claimed"),
					italic("They'll collect it within the pickup window."),
				]),
				rows: [],
			}
		case "listing.released":
			return { text: lines([bold("↩️ A claim was released")]), rows: [] }
		case "listing.collected":
			return {
				text: lines([bold("📦 Pickup completed"), italic("That surplus never became waste.")]),
				rows: [],
			}
		case "listing.no_show":
			return { text: lines([bold("⚠️ No-show reported")]), rows: [] }
		case "listing.cancelled":
			return { text: lines([bold("🚫 Listing cancelled")]), rows: [] }
		case "market.claim.confirmed":
			return { text: lines([bold("✅ Claim confirmed")]), rows: [] }
		default:
			return { text: "", rows: [] }
	}
}

const listingFor = async (chatId: number, listingId: string): Promise<MarketListingRow | null> => {
	const data = await callMain<{ items: MarketListingRow[] }>(chatId, "/v1/market").catch(() => null)
	if (data == null) return null
	return data.items.find((item) => item.id === listingId) ?? null
}

const cardFor = async (
	chatId: number,
	role: RoleValue,
	event: BridgeEvent,
): Promise<Card | null> => {
	const base = formatEvent(event)
	if (base.text === "") return null

	const listingId = String(event.data.listingId ?? "")
	if (event.name !== "listing.created" && event.name !== "listing.escalated") {
		return base
	}
	if (listingId === "") return base

	const listing = await listingFor(chatId, listingId)
	if (listing == null) return null

	const rows: InlineKeyboardButton[][] = []
	if (canClaim(role)) {
		const token = await mintToken(chatId, { listingId })
		rows.push([
			{
				text: `Claim ${qty(listing.qty, listing.unit)}`,
				callback_data: encodeAction("market.claim", token),
			},
		])
	}
	return {
		text: lines([base.text, "", marketRow(listing, dayjs())]),
		rows,
	}
}

const dispatchEvent = async (
	tenantId: string,
	event: BridgeEvent,
	opts: SseBridgeOptions,
): Promise<void> => {
	if (event.name === "report.ready") {
		const reportId = String(event.data.reportId ?? "")
		const chatId = await readReportChat(reportId)
		if (chatId === 0) return
		await opts.sendReport(chatId, reportId).catch((err) => {
			logger.warn({ err, chatId, reportId }, "report push failed")
		})
		return
	}

	for (const chatId of await listBoundChats(tenantId)) {
		const session = await getSession(chatId)
		if (session == null) continue
		const card = await cardFor(chatId, session.role as RoleValue, event).catch(() => null)
		if (card == null || card.text === "") continue
		await opts.sendMessage(chatId, card).catch((err) => {
			logger.warn({ err, chatId, event: event.name }, "sse send failed")
		})
	}
}

const runTenantConnection = async (
	tenantId: string,
	opts: SseBridgeOptions,
	attempt: number,
): Promise<void> => {
	const session = await getTenantSession(tenantId)
	if (session == null) {
		logger.warn({ tenantId }, "no bot session for tenant; skipping")
		connected.delete(tenantId)
		return
	}

	try {
		const res = await fetch(`${config.mainUrl}/v1/events`, {
			headers: {
				authorization: `Bearer ${session.accessToken}`,
				accept: "text/event-stream",
			},
		})
		if (!res.ok || res.body == null) throw new Error(`SSE connect failed: ${res.status}`)
		logger.info({ tenantId }, "sse connected")

		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""
		let lastFrameAt = Date.now()

		const heartbeat = setInterval(() => {
			if (Date.now() - lastFrameAt <= HEARTBEAT_TIMEOUT_MS) return
			logger.warn({ tenantId }, "sse heartbeat timeout; aborting")
			void reader.cancel().catch(() => undefined)
		}, 15000)

		try {
			for (;;) {
				const { value, done } = await reader.read()
				if (done) break
				if (value == null) continue
				lastFrameAt = Date.now()
				buffer += decoder.decode(value, { stream: true })

				let idx = buffer.indexOf("\n\n")
				while (idx !== -1) {
					const frame = buffer.slice(0, idx)
					buffer = buffer.slice(idx + 2)
					try {
						const parsed = parseFrame(frame)
						if (parsed != null) await dispatchEvent(tenantId, parsed, opts)
					} catch (err) {
						logger.warn({ err, tenantId }, "sse frame handling failed")
					}
					idx = buffer.indexOf("\n\n")
				}
			}
		} finally {
			clearInterval(heartbeat)
		}
		throw new Error("sse stream ended")
	} catch (err) {
		const delay = backoff(attempt)
		logger.warn({ err, tenantId, attempt, retryMs: delay }, "sse disconnected; reconnecting")
		await new Promise((resolve) => setTimeout(resolve, delay))
		void runTenantConnection(tenantId, opts, attempt + 1)
	}
}

export const startSseBridge = async (opts: SseBridgeOptions): Promise<void> => {
	bridgeOptions = opts
	const tenants = await redis.smembers("bot:tenants:known")
	logger.info({ tenants: tenants.length }, "sse bridge starting")
	for (const tenantId of tenants) {
		if (connected.has(tenantId)) continue
		connected.add(tenantId)
		void runTenantConnection(tenantId, opts, 0)
	}
}

export const registerTenant = async (tenantId: string): Promise<void> => {
	await redis.sadd("bot:tenants:known", tenantId)
	if (bridgeOptions == null || connected.has(tenantId)) return
	connected.add(tenantId)
	void runTenantConnection(tenantId, bridgeOptions, 0)
}
