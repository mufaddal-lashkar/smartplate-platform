import { queryClient } from "../../apps/main-service/src/db/client"
import { systemClock } from "../../apps/main-service/src/shared/clock"
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

	await queryClient.end()
}

await run()
