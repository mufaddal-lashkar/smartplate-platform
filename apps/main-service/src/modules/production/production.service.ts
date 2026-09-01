import type { PrepEntry, ReuseConfirmation } from "../../db/schema"
import { type SessionContext, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import type { Clock } from "../../shared/clock"
import { consumeLotsFefo } from "../../shared/fefo"
import { resolveRestaurantId } from "../catalog/catalog.queries"
import { setLeftoverStatus } from "../leftovers/leftovers.queries"
import {
	findLeftoverForReuse,
	findPrepEntryById,
	findRecipeForDish,
	findReuseHistory,
	findReusePending,
	insertPrepEntry,
	insertReuseConfirmation,
	listPrepEntries,
	type PrepEntryWithDish,
	type ReusePending,
	updatePrepEntryServed,
} from "./production.queries"
import type { PrepEntryInput, PrepEntryPatch, ReuseConfirmationInput } from "./production.schema"

const prepNotFound = () =>
	new ApiError("RESOURCE_NOT_FOUND", "That prep entry is no longer on file.")

export const listPrepEntriesForDate = async (
	ctx: SessionContext,
	serviceDate: string,
): Promise<PrepEntryWithDish[]> => listPrepEntries(ctx, serviceDate)

export const createPrepEntry = async (
	ctx: SessionContext,
	input: PrepEntryInput,
	clock: Clock,
): Promise<PrepEntry> => {
	return withTenant(ctx, async (tx) => {
		const restaurantId = await resolveRestaurantId(tx, ctx)
		const recipe = await findRecipeForDish(ctx, input.dishId)
		if (recipe.length === 0) {
			throw new ApiError(
				"VALIDATION_FAILED",
				"Add a recipe for this dish before recording a prep.",
				[{ field: "dishId", code: "NO_RECIPE", message: "Recipe is empty." }],
			)
		}

		const prepEntry = await insertPrepEntry(ctx, restaurantId, {
			dishId: input.dishId,
			serviceDate: input.serviceDate,
			mealPeriod: input.mealPeriod,
			qtyPrepared: String(input.qtyPrepared),
			qtyServed: "0",
			covers: input.covers,
			preparedAt: clock.now().toDate(),
		})

		const occurredAt = clock.now().toDate()
		for (const item of recipe) {
			if (item.unit !== item.baseUnit) {
				throw new ApiError(
					"INTERNAL",
					`Recipe unit ${item.unit} does not match ingredient base unit ${item.baseUnit}.`,
				)
			}
			const qtyRequiredBase = item.qtyPerServing * input.qtyPrepared
			await consumeLotsFefo(tx, {
				tenantId: ctx.tenantId,
				restaurantId,
				ingredientId: item.ingredientId,
				qtyRequiredBase,
				occurredAt,
				reason: "use",
			})
		}

		return prepEntry
	})
}

export const patchPrepEntry = async (
	ctx: SessionContext,
	id: string,
	input: PrepEntryPatch,
): Promise<PrepEntry> => {
	const existing = await findPrepEntryById(ctx, id)
	if (existing == null) throw prepNotFound()
	const updated = await updatePrepEntryServed(ctx, id, input.qtyServed, input.covers)
	if (updated == null) throw prepNotFound()
	return updated
}

export const getPrepEntry = async (ctx: SessionContext, id: string): Promise<PrepEntryWithDish> => {
	const found = await findPrepEntryById(ctx, id)
	if (found == null) throw prepNotFound()
	return found
}

export const listReusePending = async (ctx: SessionContext): Promise<ReusePending[]> =>
	findReusePending(ctx)

export const recordReuseConfirmation = async (
	ctx: SessionContext,
	leftoverId: string,
	input: ReuseConfirmationInput,
	clock: Clock,
): Promise<{ confirmation: ReuseConfirmation; newStatus: "awaiting_reuse" | "closed" }> => {
	return withTenant(ctx, async (tx) => {
		const leftover = await findLeftoverForReuse(ctx, leftoverId)
		if (leftover == null) {
			throw new ApiError("RESOURCE_NOT_FOUND", "That leftover no longer exists.")
		}
		if (leftover.status !== "awaiting_reuse") {
			throw new ApiError(
				"DISPOSITION_ALREADY_DECIDED",
				"This leftover is no longer awaiting reuse.",
			)
		}
		if (input.confirmedReusedQty > leftover.retainQty + 0.001) {
			throw new ApiError(
				"REUSE_EXCEEDS_RETAIN",
				`Only ${leftover.retainQty.toFixed(3)} ${leftover.unit} was retained for reuse.`,
			)
		}

		const confirmedAt = clock.now().toDate()
		const confirmation = await insertReuseConfirmation(
			ctx,
			leftoverId,
			input.confirmedReusedQty,
			input.notes,
			confirmedAt,
		)

		const fullyReused = Math.abs(input.confirmedReusedQty - leftover.retainQty) < 0.001
		const newStatus: "awaiting_reuse" | "closed" = fullyReused ? "closed" : "awaiting_reuse"
		await setLeftoverStatus(tx, leftoverId, newStatus)

		return { confirmation, newStatus }
	})
}

export const getReuseHistory = async (
	ctx: SessionContext,
	leftoverId: string,
): Promise<ReuseConfirmation[]> => findReuseHistory(ctx, leftoverId)
