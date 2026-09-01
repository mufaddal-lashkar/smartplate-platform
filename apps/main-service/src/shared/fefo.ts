import { and, asc, eq, gt, sql } from "drizzle-orm"
import { inventoryLots, inventoryMovements } from "../db/schema"
import type { Tx } from "../db/tx"
import { ApiError } from "./api-error"

export type ConsumeLotsInput = {
	tenantId: string
	restaurantId: string
	ingredientId: string
	qtyRequiredBase: number
	occurredAt: Date
	reason: "use" | "spoil" | "waste" | "transfer" | "count_correction" | "return"
}

export type ConsumeLotsResult = {
	totalConsumed: number
	movements: { lotId: string; qtyDelta: number }[]
}

export const consumeLotsFefo = async (
	tx: Tx,
	input: ConsumeLotsInput,
): Promise<ConsumeLotsResult> => {
	const lots = await tx
		.select({
			id: inventoryLots.id,
			qtyRemainingBase: inventoryLots.qtyRemainingBase,
		})
		.from(inventoryLots)
		.where(
			and(
				eq(inventoryLots.tenantId, input.tenantId),
				eq(inventoryLots.ingredientId, input.ingredientId),
				gt(inventoryLots.qtyRemainingBase, "0"),
			),
		)
		.orderBy(
			sql`${inventoryLots.expiryDate} ASC NULLS LAST`,
			asc(inventoryLots.purchaseDate),
			asc(inventoryLots.createdAt),
		)
		.for("update", { of: inventoryLots, noWait: false })

	if (input.qtyRequiredBase <= 0) {
		return { totalConsumed: 0, movements: [] }
	}

	const total = lots.reduce((sum, lot) => sum + Number(lot.qtyRemainingBase), 0)
	if (total < input.qtyRequiredBase) {
		throw new ApiError(
			"INSUFFICIENT_STOCK",
			`Not enough stock for ingredient ${input.ingredientId}.`,
		)
	}

	const movements: { lotId: string; qtyDelta: number }[] = []
	let remaining = input.qtyRequiredBase

	for (const lot of lots) {
		if (remaining <= 0) break
		const available = Number(lot.qtyRemainingBase)
		const take = Math.min(available, remaining)
		const newRemaining = available - take
		await tx
			.update(inventoryLots)
			.set({ qtyRemainingBase: String(newRemaining) })
			.where(eq(inventoryLots.id, lot.id))
		movements.push({ lotId: lot.id, qtyDelta: -take })
		remaining -= take
	}

	for (const m of movements) {
		await tx.insert(inventoryMovements).values({
			tenantId: input.tenantId,
			restaurantId: input.restaurantId,
			lotId: m.lotId,
			ingredientId: input.ingredientId,
			qtyDeltaBase: String(m.qtyDelta),
			reason: input.reason,
			occurredAt: input.occurredAt,
		})
	}

	return { totalConsumed: input.qtyRequiredBase, movements }
}

export type AddLotInput = {
	tenantId: string
	restaurantId: string
	ingredientId: string
	qtyPurchasedBase: number
	unitCost: number
	purchaseDate: string
	expiryDate: string | null
	occurredAt: Date
	reason: "use" | "spoil" | "waste" | "transfer" | "count_correction" | "return"
}

export const addLot = async (tx: Tx, input: AddLotInput): Promise<{ lotId: string }> => {
	const inserted = await tx
		.insert(inventoryLots)
		.values({
			tenantId: input.tenantId,
			restaurantId: input.restaurantId,
			ingredientId: input.ingredientId,
			qtyPurchasedBase: String(input.qtyPurchasedBase),
			qtyRemainingBase: String(input.qtyPurchasedBase),
			unitCost: String(input.unitCost),
			purchaseDate: input.purchaseDate,
			expiryDate: input.expiryDate ?? undefined,
		})
		.returning({ id: inventoryLots.id })

	const lotId = inserted[0]?.id ?? ""
	if (lotId === "") throw new ApiError("INTERNAL", "Failed to create inventory lot.")

	await tx.insert(inventoryMovements).values({
		tenantId: input.tenantId,
		restaurantId: input.restaurantId,
		lotId,
		ingredientId: input.ingredientId,
		qtyDeltaBase: String(input.qtyPurchasedBase),
		reason: input.reason,
		occurredAt: input.occurredAt,
	})

	return { lotId }
}

export type AdjustLotInput = {
	tenantId: string
	restaurantId: string
	lotId: string
	ingredientId: string
	qtyDeltaBase: number
	reason: "use" | "spoil" | "waste" | "transfer" | "count_correction" | "return"
	occurredAt: Date
}

export const adjustLot = async (
	tx: Tx,
	input: AdjustLotInput,
): Promise<{ newRemaining: number }> => {
	const rows = await tx
		.select({ qtyRemainingBase: inventoryLots.qtyRemainingBase })
		.from(inventoryLots)
		.where(eq(inventoryLots.id, input.lotId))
		.for("update", { of: inventoryLots, noWait: false })
		.limit(1)

	const current = Number(rows[0]?.qtyRemainingBase ?? 0)
	const newRemaining = current + input.qtyDeltaBase
	if (newRemaining < 0) {
		throw new ApiError("INSUFFICIENT_STOCK", "Adjustment would result in a negative lot balance.")
	}

	await tx
		.update(inventoryLots)
		.set({ qtyRemainingBase: String(newRemaining) })
		.where(eq(inventoryLots.id, input.lotId))

	await tx.insert(inventoryMovements).values({
		tenantId: input.tenantId,
		restaurantId: input.restaurantId,
		lotId: input.lotId,
		ingredientId: input.ingredientId,
		qtyDeltaBase: String(input.qtyDeltaBase),
		reason: input.reason,
		occurredAt: input.occurredAt,
	})

	return { newRemaining }
}
