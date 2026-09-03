import { describe, expect, it } from "bun:test"
import { canClaim, formatEvent, parseFrame } from "../src/sse-bridge"

describe("parseFrame", () => {
	it("takes the event name from the event: line, not the data body", () => {
		const raw = 'event: listing.escalated\ndata: {"listingId":"abc","entityId":"abc"}'
		expect(parseFrame(raw)).toEqual({
			name: "listing.escalated",
			data: { listingId: "abc", entityId: "abc" },
		})
	})

	it("ignores comment frames used as heartbeats", () => {
		expect(parseFrame(": ping")).toBeNull()
		expect(parseFrame(": connected")).toBeNull()
	})

	it("returns null when the data line is absent", () => {
		expect(parseFrame("event: listing.claimed")).toBeNull()
	})
})

describe("formatEvent", () => {
	it("renders every event name main-service actually publishes", () => {
		const published = [
			"listing.created",
			"listing.escalated",
			"listing.claimed",
			"listing.released",
			"listing.collected",
			"listing.no_show",
			"listing.cancelled",
			"market.claim.confirmed",
		]
		for (const name of published) {
			expect(formatEvent({ name, data: {} }).text).not.toBe("")
		}
	})

	it("renders an escalation as a donation headline", () => {
		expect(formatEvent({ name: "listing.escalated", data: {} }).text).toContain("needs a home")
	})

	it("renders a claim against the seller", () => {
		expect(formatEvent({ name: "listing.claimed", data: {} }).text).toContain("was claimed")
	})

	it("returns empty text for an event with no card, so nothing is sent", () => {
		expect(formatEvent({ name: "listing.updated", data: {} }).text).toBe("")
		expect(formatEvent({ name: "job.completed", data: {} }).text).toBe("")
	})
})

describe("canClaim", () => {
	it("lets owners and ngo admins claim", () => {
		expect(canClaim("owner")).toBe(true)
		expect(canClaim("ngo_admin")).toBe(true)
	})

	it("does not offer a claim button to staff or volunteers", () => {
		expect(canClaim("staff")).toBe(false)
		expect(canClaim("ngo_volunteer")).toBe(false)
	})
})
