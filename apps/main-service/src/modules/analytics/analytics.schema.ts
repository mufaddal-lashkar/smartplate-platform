import { z } from "zod"

export const dateParam = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
	.or(z.literal(""))
	.default("")

export const grainParam = z.enum(["day", "week", "month"]).default("day")

export const dateRangeSchema = z.object({
	from: dateParam,
	to: dateParam,
	grain: grainParam.optional(),
})

export const forecastsQuerySchema = z.object({
	from: dateParam,
	to: dateParam,
	targetDate: dateParam.optional(),
})
