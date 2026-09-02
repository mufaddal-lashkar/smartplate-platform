import { z } from "zod"

export const updateNgoSchema = z.object({
	name: z.string().min(2).max(120).optional(),
	contactPhone: z.string().max(40).optional(),
	activeFrom: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM")
		.optional(),
	activeTo: z
		.string()
		.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM")
		.optional(),
	serviceRadiusKm: z
		.string()
		.regex(/^\d+(\.\d+)?$/)
		.optional(),
	latitude: z
		.string()
		.regex(/^-?\d+(\.\d+)?$/)
		.optional(),
	longitude: z
		.string()
		.regex(/^-?\d+(\.\d+)?$/)
		.optional(),
})

export const submitVerificationSchema = z.object({
	registrationNo: z.string().min(2).max(80),
	contactName: z.string().min(2).max(120),
	contactPhone: z.string().max(40),
	notes: z.string().max(1000).optional(),
})

export type UpdateNgoInput = z.infer<typeof updateNgoSchema>
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>
