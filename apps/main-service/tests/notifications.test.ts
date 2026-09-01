import { afterEach, describe, expect, test } from "bun:test"
import { publishEvent } from "../src/modules/events/events.service"
import { redis } from "../src/shared/redis"

const tenantId = (): string => crypto.randomUUID()

const flushKeys = async (key: string): Promise<void> => {
	const keys = await redis.keys(key)
	if (keys.length > 0) await redis.del(...keys)
}

describe("publishEvent cap + dedup", () => {
	afterEach(async () => {
		await flushKeys("notify:cap:*")
		await flushKeys("notify:dedup:*")
	})

	test("the first 5 notifications in a window publish; the 6th is dropped", async () => {
		const t = tenantId()
		const events = Array.from({ length: 7 }, (_, i) => ({
			topic: "notifications" as const,
			name: "test.event",
			data: { entityId: `entity-${i}` },
		}))
		let published = 0
		for (const event of events) {
			await redis.subscribe(`events:${t}`)
			const handler = () => {
				published += 1
			}
			redis.on("message", handler)
			await publishEvent(t, event)
			redis.off("message", handler)
			await redis.unsubscribe()
		}
		expect(published).toBe(5)
	})

	test("a duplicate entityId within 24h is dropped", async () => {
		const t = tenantId()
		const event = {
			topic: "notifications" as const,
			name: "market.claim.confirmed",
			data: { entityId: "dup-1", listingId: "dup-1" },
		}
		await publishEvent(t, event)
		await publishEvent(t, event)
		const dedupKey = await redis.get(`notify:dedup:${t}:market.claim.confirmed:dup-1`)
		expect(dedupKey).toBe("1")
	})

	test("a non-notification topic is not capped or deduped", async () => {
		const t = tenantId()
		for (let i = 0; i < 8; i += 1) {
			await publishEvent(t, {
				topic: "market",
				name: "listing.created",
				data: { listingId: `m-${i}` },
			})
		}
		const counter = await redis.get(`notify:cap:${t}`)
		expect(counter).toBeNull()
	})

	test("a notification without an entityId still goes through the cap", async () => {
		const t = tenantId()
		const seen: string[] = []
		const sub = redis.duplicate()
		await sub.subscribe(`events:${t}`)
		sub.on("message", (_channel, payload) => {
			seen.push(payload)
		})

		for (let i = 0; i < 6; i += 1) {
			await publishEvent(t, {
				topic: "notifications",
				name: "nudge",
				data: { n: i },
			})
		}

		await new Promise((resolve) => setTimeout(resolve, 50))
		await sub.unsubscribe()
		await sub.quit()
		expect(seen.length).toBe(5)
	})
})
