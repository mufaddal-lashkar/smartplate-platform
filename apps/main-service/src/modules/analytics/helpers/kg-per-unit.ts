import type { ServingUnit } from "../../../db/schema"

const GRAMS_PER_KG = 1000

export type DishUnit = {
	servingUnit: ServingUnit
	avgServingWeightG: number
}

export const kgPerUnit = (dish: DishUnit): number => {
	if (dish.servingUnit === "kg") return 1
	if (dish.avgServingWeightG > 0) return dish.avgServingWeightG / GRAMS_PER_KG
	return 0
}
