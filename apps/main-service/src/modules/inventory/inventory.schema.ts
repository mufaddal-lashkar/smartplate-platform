import { z } from "zod"

export const purchaseInputSchema = z.object({
	ingredientId: z.string().uuid(),
	supplierId: z.string().uuid().optional(),
	qtyPurchasedBase: z.number().positive().max(1_000_000),
	unitCost: z.number().min(0).max(1_000_000),
	purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO date format YYYY-MM-DD."),
	expiryDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO date format YYYY-MM-DD.")
		.nullable()
		.default(null),
})

export type PurchaseInput = z.infer<typeof purchaseInputSchema>

export const ADJUSTMENT_REASONS = [
	"spoil",
	"waste",
	"transfer",
	"count_correction",
	"use",
	"return",
] as const

export const adjustmentInputSchema = z.object({
	lotId: z.string().uuid(),
	ingredientId: z.string().uuid(),
	qtyDeltaBase: z.number().refine((n) => n !== 0, "qtyDeltaBase must be non-zero."),
	reason: z.enum(ADJUSTMENT_REASONS),
	notes: z.string().max(240).default(""),
})

export type AdjustmentInput = z.infer<typeof adjustmentInputSchema>
