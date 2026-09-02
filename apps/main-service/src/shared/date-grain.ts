import { type SQL, sql } from "drizzle-orm"

export const SUPPORTED_GRAINS = ["day", "week", "month"] as const
export type DateGrain = (typeof SUPPORTED_GRAINS)[number]

export const isDateGrain = (grain: string): grain is DateGrain =>
	(SUPPORTED_GRAINS as readonly string[]).includes(grain)

export const assertDateGrain = (grain: string): DateGrain => {
	if (!isDateGrain(grain)) {
		throw new Error(`unknown grain: ${grain}`)
	}
	return grain
}

export const dateTrunc = (grain: string, column: SQL): SQL => {
	const safe = assertDateGrain(grain)
	if (safe === "week") {
		return sql`date_trunc('week', ${column}::timestamptz)`
	}
	return sql`date_trunc(${sql.raw(`'${safe}'`)}, ${column}::timestamptz)`
}
