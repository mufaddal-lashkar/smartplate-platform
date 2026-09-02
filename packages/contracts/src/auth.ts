import { z } from "zod"

export const tenantTypeSchema = z.enum(["restaurant", "ngo"])

export const roleSchema = z.enum(["super_admin", "owner", "staff", "ngo_admin", "ngo_volunteer"])

export const registerSchema = z.object({
	tenantType: tenantTypeSchema,
	tenantName: z.string().min(2).max(120),
	name: z.string().min(2).max(120),
	email: z.email(),
	password: z.string().min(8).max(200),
})

export const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(1).max(200),
})

export const forgotPasswordSchema = z.object({
	email: z.email(),
})

export const resetPasswordSchema = z.object({
	token: z.string().min(10).max(500),
	newPassword: z.string().min(8).max(200),
})

export const meSchema = z.object({
	user: z.object({
		id: z.string(),
		name: z.string(),
		email: z.string(),
		role: roleSchema,
	}),
	tenant: z.object({
		id: z.string(),
		name: z.string(),
		type: tenantTypeSchema,
		verified: z.boolean().optional(),
	}),
	permissions: z.array(z.string()),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type MeResponse = z.infer<typeof meSchema>
export type TenantTypeValue = z.infer<typeof tenantTypeSchema>
export type RoleValue = z.infer<typeof roleSchema>
