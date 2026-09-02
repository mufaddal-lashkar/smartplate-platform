import { sql } from "drizzle-orm"
import { withSuperAdmin } from "../../db/tx"

export type AdminTenantRow = {
	id: string
	type: string
	name: string
	status: string
	verifiedAt: string | null
	verificationStatus: string
	userCount: number
	createdAt: Date
}

export const listAllTenants = async (): Promise<AdminTenantRow[]> =>
	withSuperAdmin(async (tx) => {
		const rows = await tx.execute(sql`
			select
				t.id::text as id,
				t.type::text as type,
				t.name as name,
				t.status::text as status,
				t.created_at as created_at,
				coalesce(ngos.verified_at::text, '') as verified_at,
				coalesce(ngos.verification_status::text, 'pending') as verification_status,
				(select count(*) from users where users.tenant_id = t.id) as user_count
			from tenants t
			left join ngos on ngos.tenant_id = t.id
			order by t.created_at desc
		`)
		return rows.map((r) => {
			const row = r as Record<string, unknown>
			return {
				id: String(row.id),
				type: String(row.type),
				name: String(row.name),
				status: String(row.status),
				verifiedAt: row.verified_at === "" ? null : String(row.verified_at),
				verificationStatus: String(row.verification_status),
				userCount: Number(row.user_count),
				createdAt: new Date(String(row.created_at)),
			}
		})
	})

export const findAdminTenant = async (tenantId: string): Promise<AdminTenantRow | null> =>
	withSuperAdmin(async (tx) => {
		const rows = await tx.execute(sql`
			select
				t.id::text as id,
				t.type::text as type,
				t.name as name,
				t.status::text as status,
				t.created_at as created_at,
				coalesce(ngos.verified_at::text, '') as verified_at,
				coalesce(ngos.verification_status::text, 'pending') as verification_status,
				(select count(*) from users where users.tenant_id = t.id) as user_count
			from tenants t
			left join ngos on ngos.tenant_id = t.id
			where t.id = ${tenantId}
		`)
		if (rows.length === 0) return null
		const row = rows[0] as Record<string, unknown>
		return {
			id: String(row.id),
			type: String(row.type),
			name: String(row.name),
			status: String(row.status),
			verifiedAt: row.verified_at === "" ? null : String(row.verified_at),
			verificationStatus: String(row.verification_status),
			userCount: Number(row.user_count),
			createdAt: new Date(String(row.created_at)),
		}
	})
