import { z } from "zod"

export const prepEntryInputSchema = z.object({
	dishId: z.string().uuid(),
	serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	mealPeriod: z.string().min(1).max(40),
	qtyPrepared: z.number().positive().max(100_000),
	covers: z.number().int().min(0).max(100_000).default(0),
})

export type PrepEntryInput = z.infer<typeof prepEntryInputSchema>

export const prepEntryPatchSchema = z.object({
	qtyServed: z.number().min(0).max(100_000),
	covers: z.number().int().min(0).max(100_000).default(0),
})

export type PrepEntryPatch = z.infer<typeof prepEntryPatchSchema>

export const reuseConfirmationInputSchema = z.object({
	confirmedReusedQty: z.number().positive().max(1_000_000),
	notes: z.string().max(240).default(""),
})

export type ReuseConfirmationInput = z.infer<typeof reuseConfirmationInputSchema>
