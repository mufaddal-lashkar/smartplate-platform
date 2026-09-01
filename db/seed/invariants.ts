import { type SQL, sql } from "drizzle-orm"
import { type Tx, withTenant } from "../../apps/main-service/src/db/tx"
import { kitchenSession, resolveKitchenContext } from "./catalog"

export type InvariantReport = {
	surplusRate: number
	preparedKg: number
	leftoverKg: number
}

const SURPLUS_FLOOR = 0.12
const SURPLUS_CEILING = 0.24
const TOLERANCE = 0.0005

const failIfAny = async (tx: Tx, query: SQL, message: string) => {
	const rows = await tx.execute(query)
	if (rows.length > 0) {
		throw new Error(`${message}: ${JSON.stringify(rows.slice(0, 3))}`)
	}
}

export const assertInvariants = async (): Promise<InvariantReport> => {
	const context = await resolveKitchenContext()

	return withTenant(kitchenSession(context), async (tx) => {
		await failIfAny(
			tx,
			sql`
				select l.id, l.qty_remaining_base, coalesce(sum(m.qty_delta_base), 0) as ledger
				from inventory_lots l
				left join inventory_movements m on m.lot_id = l.id
				group by l.id, l.qty_remaining_base
				having abs(l.qty_remaining_base - coalesce(sum(m.qty_delta_base), 0)) > ${TOLERANCE}
			`,
			"Inventory movements do not sum to the lot quantity remaining",
		)

		await failIfAny(
			tx,
			sql`
				select lo.id, lo.qty, p.qty_prepared
				from leftovers lo
				join prep_entries p on p.id = lo.prep_entry_id
				where lo.qty > p.qty_prepared + ${TOLERANCE}
			`,
			"A leftover exceeds the quantity its prep entry prepared",
		)

		await failIfAny(
			tx,
			sql`
				select d.leftover_id, lo.qty,
				       d.retain_qty + d.sell_qty + d.donate_qty + d.waste_qty as allocated
				from leftover_dispositions d
				join leftovers lo on lo.id = d.leftover_id
				where abs(lo.qty - (d.retain_qty + d.sell_qty + d.donate_qty + d.waste_qty)) > ${TOLERANCE}
			`,
			"A disposition does not allocate exactly the leftover quantity",
		)

		await failIfAny(
			tx,
			sql`
				select li.leftover_id, sum(li.qty) as listed,
				       d.sell_qty + d.donate_qty as backing
				from listing_items li
				join leftover_dispositions d on d.leftover_id = li.leftover_id
				group by li.leftover_id, d.sell_qty, d.donate_qty
				having sum(li.qty) > d.sell_qty + d.donate_qty + ${TOLERANCE}
			`,
			"A listing offers more than the disposition allocated to sell and donate",
		)

		await failIfAny(
			tx,
			sql`
				select id, tenant_id from surplus_listings where claimed_by_tenant_id = tenant_id
			`,
			"A listing was claimed by the tenant that created it",
		)

		await failIfAny(
			tx,
			sql`
				select id, claimed_by_tenant_id
				  from surplus_listings
				 where status = 'open'
				   and claimed_by_tenant_id is not null
			`,
			"An open listing has a non-null claimer",
		)

		const totals = await tx.execute(sql`
			select
				coalesce(sum(p.qty_prepared * coalesce(d.avg_serving_weight_g, 1000) / 1000.0), 0) as prepared_kg,
				(
					select coalesce(sum(l.qty * coalesce(d2.avg_serving_weight_g, 1000) / 1000.0), 0)
					from leftovers l
					join dishes d2 on d2.id = l.dish_id
				) as leftover_kg
			from prep_entries p
			join dishes d on d.id = p.dish_id
		`)

		const row = totals[0]
		if (row == null) {
			throw new Error("No prep entries were written, so no surplus rate can be computed")
		}
		const preparedKg = Number(row.prepared_kg)
		const leftoverKg = Number(row.leftover_kg)
		if (preparedKg <= 0) {
			throw new Error("Prepared quantity is zero, so no surplus rate can be computed")
		}

		const surplusRate = leftoverKg / preparedKg
		if (surplusRate < SURPLUS_FLOOR || surplusRate > SURPLUS_CEILING) {
			throw new Error(
				`Realised surplus rate ${surplusRate.toFixed(4)} is outside ${SURPLUS_FLOOR}–${SURPLUS_CEILING} (${leftoverKg.toFixed(1)} kg surplus on ${preparedKg.toFixed(1)} kg prepared)`,
			)
		}

		return { surplusRate, preparedKg, leftoverKg }
	})
}
