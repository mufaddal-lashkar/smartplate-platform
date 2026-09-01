import type { Supplier } from "../../db/schema"
import type { SessionContext } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import type { Clock } from "../../shared/clock"
import {
	archiveSupplier as archiveSupplierQuery,
	insertSupplier,
	selectActiveSuppliers,
	updateSupplier as updateSupplierQuery,
} from "./suppliers.queries"
import type { SupplierInput } from "./suppliers.schema"

const supplierNotFound = () =>
	new ApiError("RESOURCE_NOT_FOUND", "That supplier is no longer on file.")

export const listSuppliers = async (ctx: SessionContext): Promise<Supplier[]> =>
	selectActiveSuppliers(ctx)

export const createSupplier = async (
	ctx: SessionContext,
	input: SupplierInput,
): Promise<Supplier> => insertSupplier(ctx, input)

export const updateSupplier = async (
	ctx: SessionContext,
	id: string,
	input: SupplierInput,
): Promise<Supplier> => {
	const updated = await updateSupplierQuery(ctx, id, input)
	if (updated == null) throw supplierNotFound()
	return updated
}

export const archiveSupplierById = async (
	ctx: SessionContext,
	id: string,
	clock: Clock,
): Promise<void> => {
	const archived = await archiveSupplierQuery(ctx, id, clock.now().toDate())
	if (!archived) throw supplierNotFound()
}
