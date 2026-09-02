import { eq } from "drizzle-orm"
import { emissionFactors } from "../db/schema"
import { withSystem } from "../db/tx"

export const DEFAULT_METHOD_SLUG = "poore-nemecek-2018"

export type EmissionFactor = {
	kgCo2ePerKg: number
	source: string
	method: string
}

const LANDFILL_CATEGORY = "landfill_disposal"

export const emissionFactorFor = async (category: string): Promise<EmissionFactor | null> => {
	const result = await withSystem(async (tx) => {
		const rows = await tx
			.select({
				kgCo2ePerKg: emissionFactors.kgCo2ePerKg,
				source: emissionFactors.source,
			})
			.from(emissionFactors)
			.where(eq(emissionFactors.category, category))
			.limit(1)
		return rows[0] ?? null
	})
	if (result == null) return null
	return {
		kgCo2ePerKg: Number(result.kgCo2ePerKg),
		source: result.source,
		method: DEFAULT_METHOD_SLUG,
	}
}

export const kgCo2eAvoidedForRecovery = async (
	qtyKg: number,
	category: string,
): Promise<number> => {
	if (qtyKg <= 0) return 0
	const factor = await emissionFactorFor(category)
	if (factor == null) return 0
	return roundKg(qtyKg * factor.kgCo2ePerKg)
}

export const kgCo2eAvoidedDisposal = async (qtyKg: number): Promise<number> => {
	if (qtyKg <= 0) return 0
	const factor = await emissionFactorFor(LANDFILL_CATEGORY)
	if (factor == null) return 0
	return roundKg(qtyKg * factor.kgCo2ePerKg)
}

const roundKg = (value: number): number => Math.round(value * 1000) / 1000
