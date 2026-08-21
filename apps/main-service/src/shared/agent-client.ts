import { z } from "zod"
import { ApiError } from "./api-error"

const AGENT_TIMEOUT_MS = 30_000

export type ReuseHistoryPoint = {
	serviceDate: string
	retainedQty: number
	actuallyReusedQty: number
}

export type ListingOutcome = {
	pricePerUnit: number
	channel: string
	sold: boolean
}

export type ReuseEstimateLeftover = {
	dishRef: string
	dishName: string
	qty: number
	unit: string
	preparedAt: string
	safeUntil: string
	storage: string
	isReusable: boolean
	reuseRoute: string
}

export type ReuseEstimateInput = {
	requestId: string
	leftover: ReuseEstimateLeftover
	dishReuseHistory: ReuseHistoryPoint[]
	tomorrowMenu: string[]
	costBasisPerUnit: number
	pastListingOutcomes: ListingOutcome[]
}

export type ReuseEstimate = {
	suggestedRetainQty: number
	suggestedSellQty: number
	suggestedDonateQty: number
	suggestedPricePerUnit: number
	reuseRoute: string
	confidence: string
	basis: string
	source: string
	model: string
	promptVersion: string
}

const reuseEstimateResponseSchema = z.object({
	suggested_retain_qty: z.number(),
	suggested_sell_qty: z.number(),
	suggested_donate_qty: z.number(),
	suggested_price_per_unit: z.number().nullable(),
	reuse_route: z.string().nullable(),
	confidence: z.string(),
	basis: z.string(),
	source: z.string(),
	model: z.string(),
	prompt_version: z.string(),
})

const agentUnavailable = () =>
	new ApiError("AI_UNAVAILABLE", "The assistant is not reachable right now.")

const postAgent = async <TBody, TResult>(
	path: string,
	body: TBody,
	requestId: string,
	schema: z.ZodType<TResult>,
): Promise<TResult> => {
	const baseUrl = process.env.AGENT_SERVICE_URL ?? ""
	if (baseUrl === "") throw agentUnavailable()

	const response = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-service-token": process.env.SERVICE_TOKEN ?? "",
			"x-request-id": requestId,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
	}).catch(() => null)

	if (response == null || !response.ok) throw agentUnavailable()

	const parsed = schema.safeParse(await response.json().catch(() => null))
	if (!parsed.success) throw agentUnavailable()

	return parsed.data
}

export const requestReuseEstimate = async (input: ReuseEstimateInput): Promise<ReuseEstimate> => {
	const payload = {
		request_id: input.requestId,
		leftover: {
			dish_ref: input.leftover.dishRef,
			dish_name: input.leftover.dishName,
			qty: input.leftover.qty,
			unit: input.leftover.unit,
			prepared_at: input.leftover.preparedAt,
			safe_until: input.leftover.safeUntil,
			storage: input.leftover.storage,
			is_reusable: input.leftover.isReusable,
			reuse_route: input.leftover.reuseRoute,
		},
		dish_reuse_history: input.dishReuseHistory.map((point) => ({
			service_date: point.serviceDate,
			retained_qty: point.retainedQty,
			actually_reused_qty: point.actuallyReusedQty,
		})),
		tomorrow_menu: input.tomorrowMenu,
		cost_basis_per_unit: input.costBasisPerUnit,
		past_listing_outcomes: input.pastListingOutcomes.map((outcome) => ({
			price_per_unit: outcome.pricePerUnit,
			channel: outcome.channel,
			sold: outcome.sold,
		})),
	}

	const result = await postAgent(
		"/v1/reuse-estimate",
		payload,
		input.requestId,
		reuseEstimateResponseSchema,
	)

	return {
		suggestedRetainQty: result.suggested_retain_qty,
		suggestedSellQty: result.suggested_sell_qty,
		suggestedDonateQty: result.suggested_donate_qty,
		suggestedPricePerUnit: result.suggested_price_per_unit ?? 0,
		reuseRoute: result.reuse_route ?? "",
		confidence: result.confidence,
		basis: result.basis,
		source: result.source,
		model: result.model,
		promptVersion: result.prompt_version,
	}
}
