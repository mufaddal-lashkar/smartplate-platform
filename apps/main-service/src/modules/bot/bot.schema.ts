import { z } from "zod"

export const bindSchema = z.object({
	chatId: z.coerce.number().int().positive(),
	tenantCode: z.string().min(1).max(64),
	email: z.string().email().max(255),
})

export const startSessionSchema = z.object({
	refreshToken: z.string().min(1).max(1024),
})

export type BindInput = z.infer<typeof bindSchema>
export type StartSessionInput = z.infer<typeof startSessionSchema>
