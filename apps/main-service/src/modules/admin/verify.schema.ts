import { z } from "zod"

export const verifyDecisionSchema = z.object({
	decision: z.enum(["approve", "reject"]),
	rejectionReason: z.string().min(1).max(1000).optional(),
})

export type VerifyDecisionInput = z.infer<typeof verifyDecisionSchema>
