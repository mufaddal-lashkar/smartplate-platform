import dayjs, { type Dayjs } from "dayjs"
import type { Leftover, SurplusListing } from "../../db/schema"
import { type SessionContext, type Tx, withTenant } from "../../db/tx"
import { type ReuseEstimate, requestReuseEstimate } from "../../shared/agent-client"
import { ApiError } from "../../shared/api-error"
import type { Clock } from "../../shared/clock"
import { safeUntilFor } from "../../shared/food-safety"
import { publishEvent } from "../events/events.service"
import { escalationWindowSeconds, scheduleEscalation } from "../listings/listings.service"
import {
	findDecidedLeftoverIds,
	findDishById,
	findDishReuseHistory,
	findLeftoverById,
	findLeftoversByIds,
	findLeftoversByServiceDate,
	findPastListingOutcomes,
	findRecentMenu,
	findRestaurantGeo,
	insertDispositionRow,
	insertLeftoverRow,
	insertListingEventRow,
	insertListingItemRow,
	insertListingRow,
	insertPredictionRow,
	requireRestaurantId,
	setLeftoverStatus,
} from "./leftovers.queries"
import {
	type Allocation,
	type CommitInput,
	type CommitResult,
	commitDispositionsSchema,
	type DispositionSuggestion,
	type LeftoverWithDish,
	type RecordLeftoverInput,
	recordLeftoverSchema,
} from "./leftovers.schema"

const SPLIT_TOLERANCE = 0.01
const HISTORY_LIMIT = 14
const MENU_LIMIT = 20
const OUTCOME_LIMIT = 20
const FALLBACK_RETAIN_SHARE = 0.4
const FALLBACK_SELL_SHARE = 0.7

const ngoBufferHours = () => Number(process.env.NGO_BUFFER_HOURS ?? 4)

const round3 = (value: number) => Math.round(value * 1000) / 1000
const round2 = (value: number) => Math.round(value * 100) / 100

export const recordLeftover = async (
	ctx: SessionContext,
	input: RecordLeftoverInput,
	clock: Clock,
): Promise<Leftover> => {
	const parsed = recordLeftoverSchema.parse(input)
	const preparedAt = dayjs(parsed.preparedAt)

	return withTenant(ctx, async (tx) => {
		const restaurantId = await requireRestaurantId(tx)
		const dish = await findDishById(tx, parsed.dishId)
		if (dish == null) throw new ApiError("RESOURCE_NOT_FOUND", "That dish no longer exists.")

		return insertLeftoverRow(tx, {
			tenantId: ctx.tenantId,
			restaurantId,
			dishId: dish.id,
			serviceDate: preparedAt.format("YYYY-MM-DD"),
			qty: String(round3(parsed.qty)),
			unit: parsed.unit,
			storage: parsed.storage,
			preparedAt: preparedAt.toDate(),
			safeUntil: safeUntilFor(preparedAt, dish.shelfLifeHours, parsed.storage).toDate(),
			status: "pending_disposition",
			createdAt: clock.now().toDate(),
		})
	})
}

export const listLeftovers = async (
	ctx: SessionContext,
	serviceDate: string,
): Promise<LeftoverWithDish[]> =>
	withTenant(ctx, async (tx) => findLeftoversByServiceDate(tx, serviceDate))

const clampSplit = (qty: number, retainQty: number, sellQty: number, donateQty: number) => {
	const retain = round3(Math.min(Math.max(retainQty, 0), qty))
	const sell = round3(Math.min(Math.max(sellQty, 0), qty - retain))
	const donate = round3(Math.min(Math.max(donateQty, 0), qty - retain - sell))
	return { retain, sell, donate, waste: round3(qty - retain - sell - donate) }
}

const localFallback = (leftover: LeftoverWithDish, sellPrice: number): DispositionSuggestion => {
	const qty = Number(leftover.qty)
	const retain = leftover.dishIsReusable ? qty * FALLBACK_RETAIN_SHARE : 0
	const remainder = qty - retain
	const sell = round3(remainder * FALLBACK_SELL_SHARE)
	const split = clampSplit(qty, retain, sell, remainder - sell)

	return {
		leftoverId: leftover.id,
		qty,
		unit: leftover.unit,
		storage: leftover.storage,
		safeUntil: dayjs(leftover.safeUntil).toISOString(),
		suggestedRetainQty: split.retain,
		suggestedSellQty: split.sell,
		suggestedDonateQty: split.donate,
		suggestedWasteQty: split.waste,
		suggestedPricePerUnit: sellPrice,
		reuseRoute: leftover.dishReuseRoute,
		confidence: "low",
		basis: "Split from the recorded quantity while the assistant is unreachable.",
		source: "unavailable",
		model: "",
		promptVersion: "",
	}
}

const pastSafeWindow = (
	leftover: LeftoverWithDish,
	sellPrice: number,
	hoursLeft: number,
): DispositionSuggestion => {
	const qty = round3(Number(leftover.qty))
	const buffer = ngoBufferHours()

	return {
		leftoverId: leftover.id,
		qty,
		unit: leftover.unit,
		storage: leftover.storage,
		safeUntil: dayjs(leftover.safeUntil).toISOString(),
		suggestedRetainQty: 0,
		suggestedSellQty: 0,
		suggestedDonateQty: 0,
		suggestedWasteQty: qty,
		suggestedPricePerUnit: sellPrice,
		reuseRoute: "",
		confidence: "high",
		basis:
			hoursLeft <= 0
				? `the safe window closed ${(-hoursLeft).toFixed(1)} hours ago, so none of it can be reused, sold or donated`
				: `only ${hoursLeft.toFixed(1)} hours of safe window remain against a ${buffer} hour collection buffer, so it cannot reach anyone in time`,
		source: "policy",
		model: "safety-policy",
		promptVersion: "safety-v1",
	}
}

const recoverySuggestion = (
	leftover: LeftoverWithDish,
	estimate: ReuseEstimate | null,
	sellPrice: number,
): DispositionSuggestion =>
	estimate == null
		? localFallback(leftover, sellPrice)
		: fromEstimate(leftover, estimate, sellPrice)

const fromEstimate = (
	leftover: LeftoverWithDish,
	estimate: ReuseEstimate,
	sellPrice: number,
): DispositionSuggestion => {
	const qty = Number(leftover.qty)
	const split = clampSplit(
		qty,
		estimate.suggestedRetainQty,
		estimate.suggestedSellQty,
		estimate.suggestedDonateQty,
	)

	return {
		leftoverId: leftover.id,
		qty,
		unit: leftover.unit,
		storage: leftover.storage,
		safeUntil: dayjs(leftover.safeUntil).toISOString(),
		suggestedRetainQty: split.retain,
		suggestedSellQty: split.sell,
		suggestedDonateQty: split.donate,
		suggestedWasteQty: split.waste,
		suggestedPricePerUnit:
			estimate.suggestedPricePerUnit > 0 ? round2(estimate.suggestedPricePerUnit) : sellPrice,
		reuseRoute: estimate.reuseRoute === "" ? leftover.dishReuseRoute : estimate.reuseRoute,
		confidence: estimate.confidence,
		basis: estimate.basis,
		source: estimate.source,
		model: estimate.model,
		promptVersion: estimate.promptVersion,
	}
}

export const suggestDisposition = async (
	ctx: SessionContext,
	leftoverId: string,
	clock: Clock,
): Promise<DispositionSuggestion> => {
	const context = await withTenant(ctx, async (tx) => {
		const leftover = await findLeftoverById(tx, leftoverId)
		if (leftover == null)
			throw new ApiError("RESOURCE_NOT_FOUND", "That leftover no longer exists.")

		const restaurantId = await requireRestaurantId(tx)
		const history = await findDishReuseHistory(tx, leftover.dishId, HISTORY_LIMIT)
		const menu = await findRecentMenu(
			tx,
			clock.now().subtract(7, "day").format("YYYY-MM-DD"),
			MENU_LIMIT,
		)
		const outcomes = await findPastListingOutcomes(tx, leftover.dishId, OUTCOME_LIMIT)

		return { leftover, restaurantId, history, menu, outcomes }
	})

	const { leftover } = context
	const listPrice = round2(Number(leftover.dishSellingPrice) * 0.5)
	const hoursLeft = dayjs(leftover.safeUntil).diff(clock.now(), "minute") / 60
	const pastCollection = hoursLeft < ngoBufferHours()

	const estimate = pastCollection
		? null
		: await requestReuseEstimate({
				requestId: crypto.randomUUID(),
				leftover: {
					dishRef: leftover.dishId,
					dishName: leftover.dishName,
					qty: Number(leftover.qty),
					unit: leftover.unit,
					preparedAt: dayjs(leftover.preparedAt).toISOString(),
					safeUntil: dayjs(leftover.safeUntil).toISOString(),
					storage: leftover.storage,
					isReusable: leftover.dishIsReusable,
					reuseRoute: leftover.dishReuseRoute,
				},
				dishReuseHistory: context.history,
				tomorrowMenu: context.menu,
				costBasisPerUnit: Number(leftover.dishCostPerUnit),
				pastListingOutcomes: context.outcomes,
			}).catch(() => null)

	const suggestion = pastCollection
		? pastSafeWindow(leftover, listPrice, hoursLeft)
		: recoverySuggestion(leftover, estimate, listPrice)

	await withTenant(ctx, async (tx) => {
		await insertPredictionRow(tx, {
			tenantId: ctx.tenantId,
			restaurantId: context.restaurantId,
			kind: "reuse",
			targetRef: leftover.id,
			payload: {
				retainQty: suggestion.suggestedRetainQty,
				sellQty: suggestion.suggestedSellQty,
				donateQty: suggestion.suggestedDonateQty,
				wasteQty: suggestion.suggestedWasteQty,
				pricePerUnit: suggestion.suggestedPricePerUnit,
				confidence: suggestion.confidence,
				basis: suggestion.basis,
			},
			model: suggestion.model,
			promptVersion: suggestion.promptVersion,
			source: suggestion.source,
		})
	})

	return suggestion
}

const totalOf = (allocation: Allocation) =>
	allocation.retainQty + allocation.sellQty + allocation.donateQty + allocation.wasteQty

const detailFor = (leftoverId: string, code: string, message: string) => [
	{ field: `allocations.${leftoverId}`, code, message },
]

type ResolvedAllocation = {
	allocation: Allocation
	leftover: LeftoverWithDish
}

const resolveAllocations = (
	allocations: Allocation[],
	byId: Map<string, LeftoverWithDish>,
	now: Dayjs,
	decided: string[],
): ResolvedAllocation[] =>
	allocations.map((allocation) => {
		const leftover = byId.get(allocation.leftoverId)
		if (leftover == null) {
			throw new ApiError(
				"RESOURCE_NOT_FOUND",
				"One of those leftovers no longer exists.",
				detailFor(allocation.leftoverId, "not_found", "This leftover is not on today's close."),
			)
		}

		if (decided.includes(allocation.leftoverId) || leftover.status !== "pending_disposition") {
			throw new ApiError(
				"DISPOSITION_ALREADY_DECIDED",
				"One of those leftovers has already been allocated.",
				detailFor(
					allocation.leftoverId,
					"already_decided",
					"This leftover already has a disposition.",
				),
			)
		}

		if (Math.abs(totalOf(allocation) - Number(leftover.qty)) > SPLIT_TOLERANCE) {
			throw new ApiError(
				"DISPOSITION_SPLIT_MISMATCH",
				"The split has to add up to the recorded quantity.",
				detailFor(
					allocation.leftoverId,
					"split_mismatch",
					`This split has to total ${leftover.qty}.`,
				),
			)
		}

		const offersFood = allocation.sellQty > 0 || allocation.donateQty > 0
		if (offersFood && !dayjs(leftover.safeUntil).isAfter(now)) {
			throw new ApiError(
				"LEFTOVER_PAST_SAFE_UNTIL",
				"That food is past its safe-until time and cannot be offered.",
				detailFor(
					allocation.leftoverId,
					"past_safe_until",
					"Past safe-until; the whole quantity is waste.",
				),
			)
		}

		return { allocation, leftover }
	})

type ListingPart = {
	leftoverId: string
	qty: number
	pricePerUnit: number
	unit: "kg" | "plate" | "piece" | "litre"
	safeUntil: Dayjs
}

const createBundledListing = async (
	tx: Tx,
	ctx: SessionContext,
	restaurantId: string,
	channel: "b2b" | "ngo",
	parts: ListingPart[],
	geo: { latitude: string; longitude: string } | null,
	now: Dayjs,
): Promise<SurplusListing> => {
	const qty = round3(parts.reduce((sum, part) => sum + part.qty, 0))
	const value = parts.reduce((sum, part) => sum + part.qty * part.pricePerUnit, 0)
	const safeUntil = parts.reduce(
		(earliest, part) => (part.safeUntil.isBefore(earliest) ? part.safeUntil : earliest),
		parts[0].safeUntil,
	)

	const bufferedUntil = safeUntil.subtract(ngoBufferHours(), "hour")
	const pickupUntil = channel === "b2b" && bufferedUntil.isAfter(now) ? bufferedUntil : safeUntil

	const listing = await insertListingRow(tx, {
		tenantId: ctx.tenantId,
		restaurantId,
		channel,
		qty: String(qty),
		unit: parts[0].unit,
		pricePerUnit: channel === "b2b" && qty > 0 ? String(round2(value / qty)) : "0",
		pickupFrom: now.toDate(),
		pickupUntil: pickupUntil.toDate(),
		safeUntil: safeUntil.toDate(),
		escalateAt: channel === "b2b" ? now.add(escalationWindowSeconds(), "second").toDate() : null,
		latitude: geo?.latitude ?? null,
		longitude: geo?.longitude ?? null,
	})

	for (const part of parts) {
		await insertListingItemRow(tx, {
			tenantId: ctx.tenantId,
			listingId: listing.id,
			leftoverId: part.leftoverId,
			qty: String(round3(part.qty)),
		})
	}

	await insertListingEventRow(tx, {
		tenantId: ctx.tenantId,
		listingId: listing.id,
		event: "created",
		detail: channel,
		occurredAt: now.toDate(),
	})

	return listing
}

export const commitDispositions = async (
	ctx: SessionContext,
	input: CommitInput,
	clock: Clock,
): Promise<CommitResult> => {
	const parsed = commitDispositionsSchema.parse(input)
	const now = clock.now()
	const leftoverIds = parsed.allocations.map((allocation) => allocation.leftoverId)

	const listings = await withTenant(ctx, async (tx) => {
		const restaurantId = await requireRestaurantId(tx)
		const geo = await findRestaurantGeo(tx, ctx.tenantId)
		const rows = await findLeftoversByIds(tx, leftoverIds)
		const byId = new Map(rows.map((row) => [row.id, row]))
		const decided = await findDecidedLeftoverIds(tx, leftoverIds)

		const resolved = resolveAllocations(parsed.allocations, byId, now, decided)

		const sellParts: ListingPart[] = []
		const donateParts: ListingPart[] = []

		for (const { allocation, leftover } of resolved) {
			await insertDispositionRow(tx, {
				tenantId: ctx.tenantId,
				leftoverId: allocation.leftoverId,
				retainQty: String(round3(allocation.retainQty)),
				sellQty: String(round3(allocation.sellQty)),
				donateQty: String(round3(allocation.donateQty)),
				wasteQty: String(round3(allocation.wasteQty)),
				sellPricePerUnit: String(round2(allocation.sellPricePerUnit)),
				aiSuggestedRetainQty: String(round3(allocation.retainQty)),
				decidedByUserId: ctx.userId,
				decidedAt: now.toDate(),
			})

			await setLeftoverStatus(
				tx,
				allocation.leftoverId,
				allocation.retainQty > 0 ? "awaiting_reuse" : "closed",
			)

			const part = {
				leftoverId: allocation.leftoverId,
				unit: leftover.unit,
				safeUntil: dayjs(leftover.safeUntil),
				pricePerUnit: allocation.sellPricePerUnit,
			}

			if (allocation.sellQty > 0) sellParts.push({ ...part, qty: allocation.sellQty })
			if (allocation.donateQty > 0) donateParts.push({ ...part, qty: allocation.donateQty })
		}

		const created: SurplusListing[] = []

		if (sellParts.length > 0) {
			created.push(await createBundledListing(tx, ctx, restaurantId, "b2b", sellParts, geo, now))
		}
		if (donateParts.length > 0) {
			created.push(await createBundledListing(tx, ctx, restaurantId, "ngo", donateParts, geo, now))
		}

		return created
	})

	for (const listing of listings) {
		await publishEvent(ctx.tenantId, {
			topic: "market",
			name: "listing.created",
			data: { listingId: listing.id, channel: listing.channel },
		})
		if (listing.channel === "b2b") {
			await scheduleEscalation(listing.id, ctx.tenantId)
		}
	}

	return { listings }
}
