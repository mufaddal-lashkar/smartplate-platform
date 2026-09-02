import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withSystem } from "../src/db/tx"
import { assertDateGrain, dateTrunc, isDateGrain } from "../src/shared/date-grain"

const runDateTrunc = async (grain: string, value: string): Promise<string> => {
	const fragment = dateTrunc(grain, sql`${value}::timestamptz`)
	const rows = await withSystem(async (tx) => tx.execute(sql`select ${fragment} as d`))
	const row = rows[0]
	if (row == null) throw new Error("date_trunc returned no row")
	return String((row as Record<string, unknown>).d)
}

describe("date-grain", () => {
	test("day grain truncates to the start of the day", async () => {
		const result = await runDateTrunc("day", "2026-08-31T15:30:00+00:00")
		expect(result).toContain("2026-08-31")
	})

	test("week grain buckets monday and sunday to the same week", async () => {
		const monday = await runDateTrunc("week", "2026-08-31T00:00:00+00:00")
		const sunday = await runDateTrunc("week", "2026-09-06T23:59:59+00:00")
		expect(monday).toBe(sunday)
	})

	test("month grain truncates to the first of the month", async () => {
		const result = await runDateTrunc("month", "2026-08-31T15:30:00+00:00")
		expect(result).toContain("2026-08-01")
	})

	test("an unknown grain throws", () => {
		expect(() => assertDateGrain("fortnight")).toThrow("unknown grain: fortnight")
	})

	test("isDateGrain narrows the literal union", () => {
		expect(isDateGrain("day")).toBe(true)
		expect(isDateGrain("week")).toBe(true)
		expect(isDateGrain("month")).toBe(true)
		expect(isDateGrain("fortnight")).toBe(false)
	})
})
