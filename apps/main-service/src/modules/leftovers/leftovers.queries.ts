import { and, desc, eq, getTableColumns, gte, inArray, isNull, sql } from "drizzle-orm"
import {
	type Dish,
	dishes,
	type Leftover,
	leftoverDispositions,
	leftovers,
	listingEvents,
	listingItems,
	type NewLeftover,
	predictions,
	prepEntries,
	restaurants,
	type SurplusListing,
	surplusListings,
} from "../../db/schema"
import type { Tx } from "../../db/tx"
import type { ListingOutcome, ReuseHistoryPoint } from "../../shared/agent-client"
import { ApiError } from "../../shared/api-error"
import type { LeftoverWithDish } from "./leftovers.schema"

const withDish = {
	...getTableColumns(leftovers),
	dishName: dishes.name,
	dishCategory: dishes.category,
	dishIsReusable: dishes.isReusable,
	dishReuseRoute: dishes.reuseRoute,
	dishShelfLifeHours: dishes.shelfLifeHours,
	dishCostPerUnit: dishes.costPerUnit,
	dishSellingPrice: dishes.sellingPrice,
}

export const requireRestaurantId = async (tx: Tx): Promise<string> => {
	const rows = await tx.select({ id: restaurants.id }).from(restaurants).limit(1)
	const id = rows[0]?.id ?? ""
	if (id === "") throw new ApiError("RESOURCE_NOT_FOUND", "This account has no restaurant yet.")
	return id
}

export const findRestaurantGeo = async (
	tx: Tx,
	tenantId: string,
): Promise<{ latitude: string; longitude: string } | null> => {
	const rows = await tx
		.select({ latitude: restaurants.latitude, longitude: restaurants.longitude })
		.from(restaurants)
		.where(eq(restaurants.tenantId, tenantId))
		.limit(1)
	const row = rows[0]
	if (row?.latitude == null || row.longitude == null) return null
	return { latitude: row.latitude, longitude: row.longitude }
}

export const findDishById = async (tx: Tx, dishId: string): Promise<Dish | null> => {
	const rows = await tx.select().from(dishes).where(eq(dishes.id, dishId)).limit(1)
	return rows[0] ?? null
}

export const insertLeftoverRow = async (tx: Tx, values: NewLeftover): Promise<Leftover> => {
	const rows = await tx.insert(leftovers).values(values).returning()
	return rows[0]
}

export const findLeftoversByServiceDate = async (
	tx: Tx,
	serviceDate: string,
): Promise<LeftoverWithDish[]> =>
	tx
		.select(withDish)
		.from(leftovers)
		.innerJoin(dishes, eq(dishes.id, leftovers.dishId))
		.where(
			serviceDate === ""
				? eq(leftovers.status, "pending_disposition")
				: eq(leftovers.serviceDate, serviceDate),
		)
		.orderBy(desc(leftovers.createdAt))

export const findLeftoverById = async (
	tx: Tx,
	leftoverId: string,
): Promise<LeftoverWithDish | null> => {
	const rows = await tx
		.select(withDish)
		.from(leftovers)
		.innerJoin(dishes, eq(dishes.id, leftovers.dishId))
		.where(eq(leftovers.id, leftoverId))
		.limit(1)
	return rows[0] ?? null
}

export const findLeftoversByIds = async (
	tx: Tx,
	leftoverIds: string[],
): Promise<LeftoverWithDish[]> =>
	tx
		.select(withDish)
		.from(leftovers)
		.innerJoin(dishes, eq(dishes.id, leftovers.dishId))
		.where(inArray(leftovers.id, leftoverIds))

export const findDecidedLeftoverIds = async (tx: Tx, leftoverIds: string[]): Promise<string[]> => {
	const rows = await tx
		.select({ leftoverId: leftoverDispositions.leftoverId })
		.from(leftoverDispositions)
		.where(inArray(leftoverDispositions.leftoverId, leftoverIds))
	return rows.map((row) => row.leftoverId)
}

export type DispositionRow = {
	tenantId: string
	leftoverId: string
	retainQty: string
	sellQty: string
	donateQty: string
	wasteQty: string
	sellPricePerUnit: string
	aiSuggestedRetainQty: string
	decidedByUserId: string
	decidedAt: Date
}

export const insertDispositionRow = async (tx: Tx, values: DispositionRow): Promise<void> => {
	await tx.insert(leftoverDispositions).values(values)
}

export const setLeftoverStatus = async (
	tx: Tx,
	leftoverId: string,
	status: "pending_disposition" | "awaiting_reuse" | "closed",
): Promise<void> => {
	await tx.update(leftovers).set({ status }).where(eq(leftovers.id, leftoverId))
}

export type ListingRow = {
	tenantId: string
	restaurantId: string
	channel: "b2b" | "ngo"
	qty: string
	unit: "kg" | "plate" | "piece" | "litre"
	pricePerUnit: string
	pickupFrom: Date
	pickupUntil: Date
	safeUntil: Date
	escalateAt: Date | null
	latitude: string | null
	longitude: string | null
}

export const insertListingRow = async (tx: Tx, values: ListingRow): Promise<SurplusListing> => {
	const rows = await tx.insert(surplusListings).values(values).returning()
	return rows[0]
}

export const insertListingItemRow = async (
	tx: Tx,
	values: { tenantId: string; listingId: string; leftoverId: string; qty: string },
): Promise<void> => {
	await tx.insert(listingItems).values(values)
}

export const insertListingEventRow = async (
	tx: Tx,
	values: {
		tenantId: string
		listingId: string
		event: string
		detail: string
		occurredAt: Date
	},
): Promise<void> => {
	await tx.insert(listingEvents).values(values)
}

export const insertPredictionRow = async (
	tx: Tx,
	values: {
		tenantId: string
		restaurantId: string
		kind: string
		targetRef: string
		payload: Record<string, string | number | boolean>
		model: string
		promptVersion: string
		source: string
	},
): Promise<void> => {
	await tx.insert(predictions).values(values)
}

export const findDishReuseHistory = async (
	tx: Tx,
	dishId: string,
	limit: number,
): Promise<ReuseHistoryPoint[]> => {
	const rows = await tx
		.select({
			serviceDate: leftovers.serviceDate,
			retainedQty: leftoverDispositions.retainQty,
		})
		.from(leftoverDispositions)
		.innerJoin(leftovers, eq(leftovers.id, leftoverDispositions.leftoverId))
		.where(eq(leftovers.dishId, dishId))
		.orderBy(desc(leftovers.serviceDate))
		.limit(limit)

	return rows.map((row) => ({
		serviceDate: row.serviceDate,
		retainedQty: Number(row.retainedQty),
		actuallyReusedQty: Number(row.retainedQty),
	}))
}

export const findRecentMenu = async (
	tx: Tx,
	fromServiceDate: string,
	limit: number,
): Promise<string[]> => {
	const recent = await tx
		.selectDistinct({ name: dishes.name })
		.from(prepEntries)
		.innerJoin(dishes, eq(dishes.id, prepEntries.dishId))
		.where(gte(prepEntries.serviceDate, fromServiceDate))
		.limit(limit)

	if (recent.length > 0) return recent.map((row) => row.name)

	const active = await tx
		.select({ name: dishes.name })
		.from(dishes)
		.where(isNull(dishes.archivedAt))
		.limit(limit)

	return active.map((row) => row.name)
}

export const findPastListingOutcomes = async (
	tx: Tx,
	dishId: string,
	limit: number,
): Promise<ListingOutcome[]> => {
	const rows = await tx
		.select({
			pricePerUnit: surplusListings.pricePerUnit,
			channel: surplusListings.channel,
			status: surplusListings.status,
		})
		.from(surplusListings)
		.innerJoin(listingItems, eq(listingItems.listingId, surplusListings.id))
		.innerJoin(leftovers, eq(leftovers.id, listingItems.leftoverId))
		.where(and(eq(leftovers.dishId, dishId), sql`${surplusListings.status} <> 'open'`))
		.orderBy(desc(surplusListings.createdAt))
		.limit(limit)

	return rows.map((row) => ({
		pricePerUnit: Number(row.pricePerUnit),
		channel: row.channel,
		sold: row.status === "completed",
	}))
}
