import { describe, expect, it } from "bun:test"
import dayjs from "dayjs"
import { empty, errorLine, esc, heading, money, percent, qty, truncate, until } from "../src/format"
import { MainApiError } from "../src/main-client"

describe("esc", () => {
	it("escapes only the three HTML-significant characters", () => {
		expect(esc("Ben & Jerry's <b>")).toBe("Ben &amp; Jerry's &lt;b&gt;")
	})

	it("leaves markdown reserved characters alone", () => {
		expect(esc("spice-route (v1.0) [b2b]")).toBe("spice-route (v1.0) [b2b]")
	})
})

describe("money", () => {
	it("renders rupees with Indian thousands separators", () => {
		expect(money("90")).toBe("₹90")
		expect(money(125000)).toBe("₹1,25,000")
	})
})

describe("qty", () => {
	it("pluralises countable units", () => {
		expect(qty(1, "plate")).toBe("1 plate")
		expect(qty(12, "plate")).toBe("12 plates")
	})

	it("leaves mass and volume units alone", () => {
		expect(qty(3, "kg")).toBe("3 kg")
		expect(qty(2.5, "litre")).toBe("2.5 litre")
	})
})

describe("percent", () => {
	it("renders a ratio as a whole percentage", () => {
		expect(percent(0.734)).toBe("73%")
		expect(percent(0)).toBe("0%")
	})
})

describe("until", () => {
	const now = dayjs("2026-09-03T18:00:00Z")

	it("renders hours and minutes remaining", () => {
		expect(until("2026-09-03T21:20:00Z", now)).toBe("safe for 3h 20m")
	})

	it("renders minutes only under an hour", () => {
		expect(until("2026-09-03T18:40:00Z", now)).toBe("safe for 40m")
	})

	it("renders expiry in the past", () => {
		expect(until("2026-09-03T17:00:00Z", now)).toBe("expired")
	})
})

describe("truncate", () => {
	it("keeps every row when under the limit", () => {
		expect(truncate(["a", "b"], 5, "/stock")).toBe("a\nb")
	})

	it("appends a pointer when rows are dropped", () => {
		const out = truncate(["a", "b", "c"], 2, "/stock")
		expect(out).toContain("a\nb")
		expect(out).toContain("1 more")
		expect(out).toContain("/stock")
	})

	it("omits the command hint when there is no command to point at", () => {
		const out = truncate(["a", "b", "c"], 2, "")
		expect(out).toContain("1 more")
		expect(out).not.toContain("send  for")
	})
})

describe("heading and empty", () => {
	it("renders a bold heading with a count", () => {
		expect(heading("Open near you", 3)).toBe("<b>Open near you</b> — 3")
	})

	it("renders an empty state with a next action", () => {
		expect(empty("No leftovers today.", "Log one with: leftover 4 plates paneer")).toContain(
			"Log one with",
		)
	})

	it("omits the hint line when there is no next action", () => {
		expect(empty("Nothing here.", "")).toBe("Nothing here.")
	})
})

describe("errorLine", () => {
	it("renders a known error code as a sentence, never the raw message", () => {
		const error = new MainApiError("LISTING_UNAVAILABLE", 409, "raw upstream text")
		expect(errorLine(error)).toContain("already been taken")
		expect(errorLine(error)).not.toContain("raw upstream text")
	})

	it("renders a forbidden error against the persona", () => {
		expect(errorLine(new MainApiError("AUTH_FORBIDDEN", 403, "raw"))).toContain("this persona")
	})

	it("falls back to a generic sentence for an unmapped error", () => {
		expect(errorLine(new Error("boom"))).toContain("Something went wrong")
	})
})
