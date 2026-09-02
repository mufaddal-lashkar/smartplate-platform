import { describe, expect, it } from "bun:test"
import { md2 } from "../src/bot/reply"

describe("md2", () => {
	it("escapes hyphens", () => {
		expect(md2("spice-route")).toBe("spice\\-route")
	})

	it("escapes underscores", () => {
		expect(md2("ngo_admin")).toBe("ngo\\_admin")
	})

	it("escapes dots", () => {
		expect(md2("v1.0")).toBe("v1\\.0")
	})

	it("escapes parentheses", () => {
		expect(md2("(verified)")).toBe("\\(verified\\)")
	})

	it("escapes every MarkdownV2 reserved character", () => {
		const reserved = "_*[]()~`>#+-=|{}.!"
		for (const ch of reserved) {
			expect(md2(ch)).toBe(`\\${ch}`)
		}
	})

	it("leaves ordinary text alone", () => {
		expect(md2("hello world")).toBe("hello world")
	})
})
