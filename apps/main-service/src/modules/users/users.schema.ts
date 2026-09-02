import { roleSchema } from "@smartplate/contracts/auth"
import { z } from "zod"

export const userIdParam = z.object({ id: z.string().uuid() })

export const inviteUserSchema = z.object({
	email: z.email(),
	name: z.string().min(2).max(120),
	role: roleSchema,
})

export const updateUserSchema = z.object({
	name: z.string().min(2).max(120).optional(),
	role: roleSchema.optional(),
})

export const archiveUserSchema = z.object({
	archived: z.boolean(),
})

export type InviteUserInput = z.infer<typeof inviteUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ArchiveUserInput = z.infer<typeof archiveUserSchema>
