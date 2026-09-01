import { queryClient } from "../../apps/main-service/src/db/client"
import { systemClock } from "../../apps/main-service/src/shared/clock"
import { seedCatalog } from "./catalog"
import { seedHistory } from "./history"
import { assertInvariants } from "./invariants"
import { seedOpenListings } from "./open-listings"
import { isAlreadySeeded, seedP0Identity } from "./p0-identity"

const run = async () => {
	if (await isAlreadySeeded()) {
		console.log("Already seeded — nothing written. Use `docker compose down -v` to start over.")
		await queryClient.end()
		return
	}

	const accounts = await seedP0Identity(systemClock)

	console.log(`Seeded ${accounts.length} accounts:\n`)
	for (const account of accounts) {
		console.log(`  ${account.label.padEnd(32)} ${account.email.padEnd(30)} ${account.password}`)
	}

	const catalog = await seedCatalog(systemClock)
	const history = await seedHistory(systemClock)
	const openListings = await seedOpenListings(systemClock)
	const report = await assertInvariants()

	console.log(`\nSpice Route catalog: ${catalog.ingredients} ingredients, ${catalog.dishes} dishes`)
	console.log(
		`Operating history: ${history.days} days, ${history.prepEntries} prep entries, ` +
			`${history.leftovers} leftovers, ${history.dispositions} dispositions, ` +
			`${history.reuseConfirmations} reuse confirmations, ` +
			`${history.lots} lots, ${history.movements} stock movements`,
	)
	console.log(
		`Listings: ${history.listings} across ` +
			Object.entries(history.outcomes)
				.sort(([a], [b]) => (a < b ? -1 : 1))
				.map(([outcome, count]) => `${outcome} ${count}`)
				.join(", "),
	)
	console.log(`Open listings seeded for live demo: ${openListings}`)
	console.log(
		`Realised surplus rate: ${(report.surplusRate * 100).toFixed(1)}% ` +
			`(${report.leftoverKg.toFixed(0)} kg surplus on ${report.preparedKg.toFixed(0)} kg prepared)`,
	)
	console.log("Every invariant passed.")

	await queryClient.end()
}

await run()
