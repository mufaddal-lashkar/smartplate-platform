import { describe, expect, it } from "bun:test"

type SseFrame = { topic: string; name: string; data: Record<string, string | number> }

const parseFrame = (raw: string): SseFrame | null => {
	const lines = raw.split("\n")
	let data = ""
	for (const line of lines) {
		if (line.startsWith("data: ")) data = line.slice("data: ".length).trim()
	}
	if (data === "") return null
	const parsed = JSON.parse(data) as {
		topic?: string
		name?: string
		data?: Record<string, string | number>
	}
	if (parsed.name == null || parsed.data == null) return null
	return { topic: parsed.topic ?? "notifications", name: parsed.name, data: parsed.data }
}

const formatEvent = (event: SseFrame): string => {
	const headline = (() => {
		switch (event.name) {
			case "market.created":
				return "New listing on the market"
			case "market.claimed":
				return "Listing claimed"
			case "verification.approved":
				return "Verification approved"
			default:
				return event.name
		}
	})()
	const summary = Object.entries(event.data)
		.slice(0, 4)
		.map(([k, v]) => `${k}: ${String(v)}`)
		.join(" • ")
	return summary === "" ? headline : `${headline}\n${summary}`
}

describe("sse-bridge parsing", () => {
	it("parses an event with topic in the data", () => {
		const raw =
			'event: market.created\ndata: {"topic":"market","name":"market.created","data":{"listingId":"abc","qty":"3 kg"}}'
		const result = parseFrame(raw)
		expect(result).not.toBeNull()
		expect(result?.topic).toBe("market")
		expect(result?.name).toBe("market.created")
	})

	it("returns null when data is empty", () => {
		const result = parseFrame("event: ping\n\n")
		expect(result).toBeNull()
	})

	it("returns null when name and data are both missing", () => {
		const result = parseFrame("event: keep-alive\ndata: {}\n\n")
		expect(result).toBeNull()
	})
})

describe("formatEvent", () => {
	it("renders a market.created event with summary", () => {
		const text = formatEvent({
			topic: "market",
			name: "market.created",
			data: { listingId: "abc", qty: "3 kg" },
		})
		expect(text).toContain("New listing on the market")
		expect(text).toContain("listingId: abc")
	})

	it("renders an unknown event with just the name", () => {
		const text = formatEvent({ topic: "notifications", name: "something.odd", data: {} })
		expect(text).toBe("something.odd")
	})
})
