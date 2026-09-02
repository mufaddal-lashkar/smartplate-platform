import type { Bot } from "grammy"
import type { BotContext } from "./bot/bot"
import { config } from "./config"
import { redis } from "./db"
import { logger } from "./logger"
import { getTenantSession } from "./main-client"

const RECONNECT_MS = [1000, 2000, 4000, 8000, 16000, 30000, 60000]
const HEARTBEAT_TIMEOUT_MS = 60_000

export type BridgeEvent = {
	topic: "jobs" | "notifications" | "market"
	name: string
	data: Record<string, string | number>
}

export type SseBridgeOptions = {
	bot: Bot<BotContext>
	sendMessage: (chatId: number, text: string) => Promise<void>
}

const bindingKey = (tenantId: string) => `bot:tenant:${tenantId}:chats`

export const listBoundChats = async (tenantId: string): Promise<number[]> => {
	const ids = await redis.smembers(bindingKey(tenantId))
	return ids.map((s) => Number.parseInt(s, 10)).filter((n) => Number.isFinite(n))
}

const backoff = (attempt: number): number => {
	const idx = Math.min(attempt, RECONNECT_MS.length - 1)
	return RECONNECT_MS[idx] ?? 60000
}

const formatEvent = (event: BridgeEvent): string => {
	const lines: string[] = []
	switch (event.name) {
		case "market.created":
			lines.push("New listing on the market")
			break
		case "market.escalated":
			lines.push("A listing was escalated")
			break
		case "market.updated":
			lines.push("Listing updated")
			break
		case "market.cancelled":
			lines.push("Listing cancelled")
			break
		case "market.claimed":
			lines.push("Listing claimed")
			break
		case "market.released":
			lines.push("Claim released")
			break
		case "market.collected":
			lines.push("Pickup completed")
			break
		case "market.no_show":
			lines.push("No-show reported")
			break
		case "claim.confirmed":
			lines.push("Claim confirmed")
			break
		case "pickup.completed":
			lines.push("Pickup completed")
			break
		case "verification.approved":
			lines.push("Verification approved")
			break
		case "verification.rejected":
			lines.push("Verification rejected")
			break
		default:
			lines.push(event.name)
	}
	const dataSummary = Object.entries(event.data)
		.slice(0, 4)
		.map(([k, v]) => `${k}: ${String(v)}`)
		.join(" • ")
	if (dataSummary !== "") lines.push(dataSummary)
	return lines.join("\n")
}

const parseSseFrame = (raw: string): { name: string; data: string } | null => {
	const lines = raw.split("\n")
	let name = ""
	let data = ""
	for (const line of lines) {
		if (line.startsWith("event: ")) name = line.slice("event: ".length).trim()
		else if (line.startsWith("data: ")) data = line.slice("data: ".length).trim()
	}
	if (name === "" && data === "") return null
	return { name, data }
}

export const startSseBridge = async (opts: SseBridgeOptions): Promise<void> => {
	const tenantsKey = "bot:tenants:known"
	const tenants = await redis.smembers(tenantsKey)
	logger.info({ tenants: tenants.length }, "sse bridge starting")
	for (const tenantId of tenants) {
		void runTenantConnection(tenantId, opts, 0)
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
		return
	}
	const url = `${config.mainUrl}/v1/events?topics=notifications,market`
	const headers: Record<string, string> = {
		authorization: `Bearer ${session.accessToken}`,
		accept: "text/event-stream",
	}

	try {
		const res = await fetch(url, { headers })
		if (!res.ok || res.body == null) {
			throw new Error(`SSE connect failed: ${res.status}`)
		}
		logger.info({ tenantId }, "sse connected")

		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""
		let lastFrameAt = Date.now()

		const heartbeatCheck = setInterval(() => {
			const elapsed = Date.now() - lastFrameAt
			if (elapsed > HEARTBEAT_TIMEOUT_MS) {
				logger.warn({ tenantId, elapsed }, "sse heartbeat timeout; aborting")
				void reader.cancel().catch(() => undefined)
			}
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
					const parsed = parseSseFrame(frame)
					if (parsed != null && parsed.data !== "") {
						try {
							const payload = JSON.parse(parsed.data) as {
								topic?: BridgeEvent["topic"]
								name?: string
								data?: Record<string, string | number>
							}
							if (payload.name == null || payload.data == null) continue
							const topic = payload.topic ?? "notifications"
							if (topic === "jobs") continue
							await dispatchEvent(tenantId, { topic, name: payload.name, data: payload.data }, opts)
						} catch (err) {
							logger.warn({ err, tenantId }, "sse frame parse failed")
						}
					}
					idx = buffer.indexOf("\n\n")
				}
			}
		} finally {
			clearInterval(heartbeatCheck)
		}
	} catch (err) {
		const delay = backoff(attempt)
		logger.warn({ err, tenantId, attempt, retryMs: delay }, "sse disconnected; reconnecting")
		await new Promise((r) => setTimeout(r, delay))
		void runTenantConnection(tenantId, opts, attempt + 1)
	}
}

const dispatchEvent = async (
	tenantId: string,
	event: BridgeEvent,
	opts: SseBridgeOptions,
): Promise<void> => {
	const chats = await listBoundChats(tenantId)
	if (chats.length === 0) return
	const text = formatEvent(event)
	for (const chatId of chats) {
		try {
			await opts.sendMessage(chatId, text)
		} catch (err) {
			logger.warn({ err, chatId, event: event.name }, "sse send failed")
		}
	}
}

export const registerTenant = async (tenantId: string): Promise<void> => {
	await redis.sadd("bot:tenants:known", tenantId)
}
