import { sql } from "drizzle-orm"
import { db } from "../../apps/main-service/src/db/client"
import {
	applySessionContext,
	setSessionConfig,
	withSystem,
} from "../../apps/main-service/src/db/tx"
import type { Clock } from "../../apps/main-service/src/shared/clock"

export type SeededAccount = {
	label: string
	email: string
	password: string
}

const EMISSION_FACTORS: [string, string, string][] = [
	["cereals", "1.400", "Poore & Nemecek (2018), cradle-to-retail"],
	["vegetables", "0.500", "Poore & Nemecek (2018), cradle-to-retail"],
	["fruits", "1.100", "Poore & Nemecek (2018), cradle-to-retail"],
	["legumes", "0.900", "Poore & Nemecek (2018), cradle-to-retail"],
	["oils", "3.500", "Poore & Nemecek (2018), cradle-to-retail"],
	["dairy", "3.200", "Poore & Nemecek (2018), cradle-to-retail"],
	["cheese", "11.000", "Poore & Nemecek (2018), cradle-to-retail"],
	["eggs", "4.700", "Poore & Nemecek (2018), cradle-to-retail"],
	["poultry", "6.900", "Poore & Nemecek (2018), cradle-to-retail"],
	["mutton", "24.000", "Poore & Nemecek (2018), cradle-to-retail"],
	["landfill_disposal", "2.500", "CH4 at GWP-100, mixed food waste"],
]

const TENANTS: {
	type: "restaurant" | "ngo"
	name: string
	owner: { name: string; email: string; role: "owner" | "ngo_admin" }
	staff: { name: string; email: string; role: "staff" | "ngo_volunteer" }
}[] = [
	{
		type: "restaurant",
		name: "Spice Route",
		owner: { name: "Asha Menon", email: "asha@spiceroute.local", role: "owner" },
		staff: { name: "Vikram Rao", email: "vikram@spiceroute.local", role: "staff" },
	},
	{
		type: "restaurant",
		name: "Anna Tiffin",
		owner: { name: "Meera Iyer", email: "meera@annatiffin.local", role: "owner" },
		staff: { name: "Suresh Nair", email: "suresh@annatiffin.local", role: "staff" },
	},
	{
		type: "ngo",
		name: "Akshaya Trust",
		owner: { name: "Ravi Kumar", email: "ravi@akshaya.local", role: "ngo_admin" },
		staff: { name: "Priya Das", email: "priya@akshaya.local", role: "ngo_volunteer" },
	},
]

export const SEED_PASSWORD = "smartplate-demo-2026"

export const isAlreadySeeded = async (): Promise<boolean> =>
	withSystem(async (tx) => {
		const rows = await tx.execute(sql`select 1 as present from tenants limit 1`)
		return rows.length > 0
	})

export const seedP0Identity = async (clock: Clock): Promise<SeededAccount[]> => {
	const createdAt = clock.now().toISOString()
	const passwordHash = await Bun.password.hash(SEED_PASSWORD)
	const accounts: SeededAccount[] = []

	await db.transaction(async (tx) => {
		await setSessionConfig(tx, "app.role", "system")
		for (const [category, factor, source] of EMISSION_FACTORS) {
			await tx.execute(sql`
				insert into emission_factors (category, kg_co2e_per_kg, source)
				values (${category}, ${factor}, ${source})
				on conflict (category) do nothing
			`)
		}
	})

	for (const spec of TENANTS) {
		await db.transaction(async (tx) => {
			await setSessionConfig(tx, "app.role", "system")

			const created = await tx.execute(sql`
				with t as (
					insert into tenants (type, name, created_at)
					values (${spec.type}, ${spec.name}, ${createdAt})
					returning id
				), u as (
					insert into users (tenant_id, email, password_hash, name, role, created_at)
					select t.id, ${spec.owner.email}, ${passwordHash}, ${spec.owner.name},
					       ${spec.owner.role}::user_role, ${createdAt}
					from t
					returning id, tenant_id
				)
				select u.id as user_id, u.tenant_id as tenant_id from u
			`)

			const tenantId = String(created[0]?.tenant_id)
			const ownerId = String(created[0]?.user_id)

			await tx.execute(sql`
				insert into users (tenant_id, email, password_hash, name, role, created_at)
				values (${tenantId}, ${spec.staff.email}, ${passwordHash}, ${spec.staff.name},
				        ${spec.staff.role}::user_role, ${createdAt})
			`)

			await applySessionContext(tx, {
				tenantId,
				tenantType: spec.type,
				role: spec.owner.role,
				userId: ownerId,
			})

			if (spec.type === "restaurant") {
				await tx.execute(sql`
					insert into restaurants (tenant_id, name, city, cuisine_type, created_at)
					values (${tenantId}, ${spec.name}, 'Bengaluru', 'Multi-cuisine', ${createdAt})
				`)
			} else {
				await tx.execute(sql`
					insert into ngos (tenant_id, name, active_from, active_to, created_at)
					values (${tenantId}, ${spec.name}, '06:00', '14:00', ${createdAt})
				`)
			}
		})

		accounts.push(
			{
				label: `${spec.name} (${spec.owner.role})`,
				email: spec.owner.email,
				password: SEED_PASSWORD,
			},
			{
				label: `${spec.name} (${spec.staff.role})`,
				email: spec.staff.email,
				password: SEED_PASSWORD,
			},
		)
	}

	return accounts
}
