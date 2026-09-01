import { sql } from "drizzle-orm"
import { setSessionConfig, withSystem } from "../../src/db/tx"

export type TestTenant = {
	id: string
	ownerId: string
}

export const makeTenant = async (type: "restaurant" | "ngo"): Promise<TestTenant> => {
	const suffix = crypto.randomUUID().slice(0, 8)
	const role = type === "restaurant" ? "owner" : "ngo_admin"

	return withSystem(async (tx) => {
		const rows = await tx.execute(sql`
			with t as (
				insert into tenants (type, name) values (${type}, ${`Test ${suffix}`}) returning id
			), u as (
				insert into users (tenant_id, email, password_hash, name, role)
				select t.id, ${`owner-${suffix}@test.local`}, 'x', 'Owner', ${role}::user_role
				from t returning id, tenant_id
			)
			select u.tenant_id as tenant_id, u.id as owner_id from u
		`)

		return { id: String(rows[0]?.tenant_id), ownerId: String(rows[0]?.owner_id) }
	})
}

export const makeNgoTenant = async (verified: boolean): Promise<TestTenant> => {
	const tenant = await makeTenant("ngo")
	await withSystem(async (tx) => {
		await setSessionConfig(tx, "app.tenant_id", tenant.id)
		await tx.execute(sql`
			insert into ngos (tenant_id, name, service_radius_km, active_from, active_to, verified_at, latitude, longitude)
			values (
				${tenant.id}, ${`Test NGO ${tenant.id.slice(0, 8)}`}, 25, '00:00', '23:59',
				${verified ? new Date().toISOString() : null},
				19.076, 72.8777
			)
		`)
	})
	return tenant
}
