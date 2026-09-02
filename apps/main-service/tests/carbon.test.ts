import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { withSystem } from "../src/db/tx"
import {
	DEFAULT_METHOD_SLUG,
	emissionFactorFor,
	kgCo2eAvoidedDisposal,
	kgCo2eAvoidedForRecovery,
} from "../src/shared/carbon"

const ensureEmissionFactors = async (): Promise<void> => {
	await withSystem(async (tx) => {
		await tx.execute(sql`
			insert into emission_factors (category, kg_co2e_per_kg, source) values
				('cereals', 1.400, 'test'),
				('vegetables', 0.500, 'test'),
				('landfill_disposal', 2.500, 'test')
			on conflict (category) do update set kg_co2e_per_kg = excluded.kg_co2e_per_kg
		`)
	})
}

describe("carbon", () => {
	test("kgCo2eAvoidedForRecovery returns a positive value for a known category", async () => {
		await ensureEmissionFactors()

		const value = await kgCo2eAvoidedForRecovery(10, "cereals")

		expect(value).toBeGreaterThan(0)
		expect(value).toBeCloseTo(14, 6)
	})

	test("kgCo2eAvoidedForRecovery returns 0 for an unknown category", async () => {
		const value = await kgCo2eAvoidedForRecovery(10, "no-such-thing")
		expect(value).toBe(0)
	})

	test("kgCo2eAvoidedForRecovery returns 0 for a non-positive qty", async () => {
		const value = await kgCo2eAvoidedForRecovery(0, "cereals")
		expect(value).toBe(0)
	})

	test("emissionFactorFor returns a method slug for deep-linking", async () => {
		await ensureEmissionFactors()

		const factor = await emissionFactorFor("vegetables")

		expect(factor).not.toBeNull()
		expect(factor?.kgCo2ePerKg).toBeCloseTo(0.5, 6)
		expect(factor?.method).toBe(DEFAULT_METHOD_SLUG)
	})

	test("kgCo2eAvoidedDisposal uses the landfill factor", async () => {
		await ensureEmissionFactors()

		const value = await kgCo2eAvoidedDisposal(4)

		expect(value).toBeCloseTo(10, 6)
	})
})
