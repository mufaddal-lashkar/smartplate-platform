import { z } from "zod"

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export const preferenceItemSchema = z.object({
	topic: z.string().min(1).max(64),
	radiusKm: z.number().nonnegative().max(500).nullable(),
	activeFrom: z.string().regex(timePattern, "Expected HH:MM"),
	activeTo: z.string().regex(timePattern, "Expected HH:MM"),
	quietHoursEnabled: z.boolean(),
})

export const preferencesPutSchema = z.object({
	preferences: z.array(preferenceItemSchema).max(32),
})

export type PreferenceItem = z.infer<typeof preferenceItemSchema>
export type PreferencesPutInput = z.infer<typeof preferencesPutSchema>
