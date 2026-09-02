import { z } from "zod"

export const updateTenantSchema = z.object({
	name: z.string().min(2).max(120).optional(),
})

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>
