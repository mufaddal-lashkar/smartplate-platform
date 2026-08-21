import { z } from "zod"
import type { Leftover, ServingUnit, StorageMethod, SurplusListing } from "../../db/schema"

export const servingUnitSchema = z.enum(["kg", "plate", "piece", "litre"])
export const storageMethodSchema = z.enum(["room_temp", "refrigerated", "frozen"])

export const recordLeftoverSchema = z.object({
	dishId: z.uuid(),
	qty: z.number().positive().max(100_000),
	unit: servingUnitSchema,
	storage: storageMethodSchema,
	preparedAt: z.iso.datetime(),
})

export const allocationSchema = z.object({
	leftoverId: z.uuid(),
	retainQty: z.number().min(0),
	sellQty: z.number().min(0),
	donateQty: z.number().min(0),
	wasteQty: z.number().min(0),
	sellPricePerUnit: z.number().min(0),
})

export const commitDispositionsSchema = z.object({
	allocations: z.array(allocationSchema).min(1).max(200),
})

export const listLeftoversQuerySchema = z.object({
	serviceDate: z.union([z.iso.date(), z.literal("")]),
})

export type RecordLeftoverInput = z.infer<typeof recordLeftoverSchema>
export type Allocation = z.infer<typeof allocationSchema>
export type CommitInput = z.infer<typeof commitDispositionsSchema>

export type LeftoverWithDish = Leftover & {
	dishName: string
	dishCategory: string
	dishIsReusable: boolean
	dishReuseRoute: string
	dishShelfLifeHours: number
	dishCostPerUnit: string
	dishSellingPrice: string
}

export type DispositionSuggestion = {
	leftoverId: string
	qty: number
	unit: ServingUnit
	storage: StorageMethod
	safeUntil: string
	suggestedRetainQty: number
	suggestedSellQty: number
	suggestedDonateQty: number
	suggestedWasteQty: number
	suggestedPricePerUnit: number
	reuseRoute: string
	confidence: string
	basis: string
	source: string
	model: string
	promptVersion: string
}

export type CommitResult = {
	listings: SurplusListing[]
}
