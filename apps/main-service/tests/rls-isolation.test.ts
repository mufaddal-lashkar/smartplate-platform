import { describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { db } from "../src/db/client"
import { withTenant } from "../src/db/tx"
import { makeTenant } from "./helpers/db"

const tenantScopedTables = async (): Promise<string[]> => {
	const rows = await db.execute(sql`
		select c.relname as table_name
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public'
		  and c.relkind = 'r'
		  and exists (
		    select 1 from information_schema.columns col
		    where col.table_schema = 'public'
		      and col.table_name = c.relname
		      and col.column_name = 'tenant_id'
		  )
		order by c.relname
	`)
	return rows.map((r) => String(r.table_name))
}

describe("rls configuration", () => {
	test("every tenant-scoped table has row-level security enabled and forced", async () => {
		const rows = await db.execute(sql`
			select c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
			from pg_class c
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public'
			  and c.relkind = 'r'
			  and exists (
			    select 1 from information_schema.columns col
			    where col.table_schema = 'public'
			      and col.table_name = c.relname
			      and col.column_name = 'tenant_id'
			  )
		`)

		expect(rows.length).toBeGreaterThan(0)
		for (const row of rows) {
			expect(row.relrowsecurity, `${row.table_name} has RLS disabled`).toBe(true)
			expect(row.relforcerowsecurity, `${row.table_name} does not FORCE RLS`).toBe(true)
		}
	})
})

describe("rls isolation", () => {
	test("tenant B sees zero rows of tenant A on every tenant-scoped table", async () => {
		const a = await makeTenant("restaurant")
		const b = await makeTenant("restaurant")
		const tables = await tenantScopedTables()

		expect(tables.length).toBeGreaterThan(0)

		for (const table of tables) {
			const visible = await withTenant(
				{ tenantId: b.id, tenantType: "restaurant", role: "owner", userId: b.ownerId },
				async (tx) => {
					const rows = await tx.execute(
						sql`select count(*)::int as c from ${sql.identifier(table)} where tenant_id = ${a.id}`,
					)
					return Number(rows[0]?.c ?? -1)
				},
			)
			expect(visible, `${table} leaked tenant A rows to tenant B`).toBe(0)
		}
	})

	test("a query with no session context sees nothing, not everything", async () => {
		const a = await makeTenant("restaurant")

		const rows = await db.execute(
			sql`select count(*)::int as c from restaurants where tenant_id = ${a.id}`,
		)
		expect(Number(rows[0]?.c)).toBe(0)
	})

	test("a tenant cannot insert rows attributed to another tenant", async () => {
		const a = await makeTenant("restaurant")
		const b = await makeTenant("restaurant")

		const attempt = withTenant(
			{ tenantId: b.id, tenantType: "restaurant", role: "owner", userId: b.ownerId },
			async (tx) =>
				tx.execute(sql`insert into notifications (tenant_id, type) values (${a.id}, 'spoof')`),
		)

		await expect(attempt).rejects.toThrow()
	})
})
