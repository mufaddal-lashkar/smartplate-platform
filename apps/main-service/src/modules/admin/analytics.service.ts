import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../../db/tx"

export type AdminAnalytics = {
	totalTenants: number
	totalRestaurants: number
	totalNgos: number
	verifiedNgos: number
	pendingNgos: number
	rejectedNgos: number
	totalUsers: number
	totalKgDiverted: string
	totalCarbonAvoidedKg: string
}

export const getAdminAnalytics = async (): Promise<AdminAnalytics> =>
	withSuperAdmin(async (tx) => {
		const rows = await tx.execute(sql`
			select
				(select count(*) from tenants) as total_tenants,
				(select count(*) from tenants where type = 'restaurant') as total_restaurants,
				(select count(*) from tenants where type = 'ngo') as total_ngos,
				(select count(*) from ngos where verification_status = 'approved') as verified_ngos,
				(select count(*) from ngos where verification_status = 'pending') as pending_ngos,
				(select count(*) from ngos where verification_status = 'rejected') as rejected_ngos,
				(select count(*) from users) as total_users,
				coalesce((select sum(sell_qty + donate_qty)::numeric from leftover_dispositions), 0)::text as total_kg_diverted
		`)
		const row = rows[0] as Record<string, unknown>
		return {
			totalTenants: Number(row.total_tenants),
			totalRestaurants: Number(row.total_restaurants),
			totalNgos: Number(row.total_ngos),
			verifiedNgos: Number(row.verified_ngos),
			pendingNgos: Number(row.pending_ngos),
			rejectedNgos: Number(row.rejected_ngos),
			totalUsers: Number(row.total_users),
			totalKgDiverted: String(row.total_kg_diverted ?? "0"),
			totalCarbonAvoidedKg: "0",
		}
	})
