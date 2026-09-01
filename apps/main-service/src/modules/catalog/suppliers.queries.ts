import { and, asc, eq, isNull } from "drizzle-orm"
import { type Supplier, suppliers } from "../../db/schema"
import { type SessionContext, type Tx, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import type { SupplierInput } from "./suppliers.schema"

const supplierColumns = (input: SupplierInput) => ({
	name: input.name,
	contactName: input.contactName,
	contactPhone: input.contactPhone,
	contactEmail: input.contactEmail,
	addressLine: input.addressLine,
})

export const selectActiveSuppliers = async (ctx: SessionContext): Promise<Supplier[]> =>
	withTenant(ctx, (tx) =>
		tx.select().from(suppliers).where(isNull(suppliers.archivedAt)).orderBy(asc(suppliers.name)),
	)

export const insertSupplier = async (
	ctx: SessionContext,
	input: SupplierInput,
): Promise<Supplier> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.insert(suppliers)
			.values({ tenantId: ctx.tenantId, ...supplierColumns(input) })
			.returning()
		const created = rows[0] ?? null
		if (created == null) throw new ApiError("INTERNAL", "The supplier could not be saved.")
		return created
	})

export const updateSupplier = async (
	ctx: SessionContext,
	id: string,
	input: SupplierInput,
): Promise<Supplier | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.update(suppliers)
			.set(supplierColumns(input))
			.where(and(eq(suppliers.id, id), isNull(suppliers.archivedAt)))
			.returning()
		return rows[0] ?? null
	})

export const archiveSupplier = async (
	ctx: SessionContext,
	id: string,
	archivedAt: Date,
): Promise<boolean> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.update(suppliers)
			.set({ archivedAt })
			.where(and(eq(suppliers.id, id), isNull(suppliers.archivedAt)))
			.returning({ id: suppliers.id })
		return rows.length > 0
	})

export const findSupplierById = async (tx: Tx, id: string): Promise<Supplier | null> => {
	const rows = await tx
		.select()
		.from(suppliers)
		.where(and(eq(suppliers.id, id), isNull(suppliers.archivedAt)))
		.limit(1)
	return rows[0] ?? null
}
