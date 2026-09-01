import { z } from "zod"

export const supplierInputSchema = z.object({
	name: z.string().min(1).max(120),
	contactName: z.string().max(120).default(""),
	contactPhone: z.string().max(40).default(""),
	contactEmail: z.string().max(160).default(""),
	addressLine: z.string().max(240).default(""),
})

export type SupplierInput = z.infer<typeof supplierInputSchema>
