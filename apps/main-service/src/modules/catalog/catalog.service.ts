import type { Dish } from "../../db/schema"
import type { SessionContext } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import type { Clock } from "../../shared/clock"
import {
	insertDish,
	markDishArchived,
	selectActiveDishes,
	updateActiveDish,
} from "./catalog.queries"
import type { DishInput } from "./catalog.schema"

const dishNotFound = () =>
	new ApiError("RESOURCE_NOT_FOUND", "That dish is no longer on your menu.")

const assertServingWeight = (input: DishInput) => {
	if (input.servingUnit === "kg" || input.avgServingWeightG > 0) return

	throw new ApiError("VALIDATION_FAILED", "Some fields need attention.", [
		{
			field: "avgServingWeightG",
			code: "SERVING_WEIGHT_REQUIRED",
			message: `A dish measured by ${input.servingUnit} needs an average serving weight so waste can be reported in kilograms.`,
		},
	])
}

export const listDishes = async (ctx: SessionContext): Promise<Dish[]> => selectActiveDishes(ctx)

export const createDish = async (
	ctx: SessionContext,
	input: DishInput,
	clock: Clock,
): Promise<Dish> => {
	assertServingWeight(input)
	return insertDish(ctx, input, clock.now().toDate())
}

export const updateDish = async (
	ctx: SessionContext,
	id: string,
	input: DishInput,
): Promise<Dish> => {
	assertServingWeight(input)

	const updated = await updateActiveDish(ctx, id, input)
	if (updated == null) throw dishNotFound()
	return updated
}

export const archiveDish = async (ctx: SessionContext, id: string, clock: Clock): Promise<void> => {
	const archived = await markDishArchived(ctx, id, clock.now().toDate())
	if (!archived) throw dishNotFound()
}
