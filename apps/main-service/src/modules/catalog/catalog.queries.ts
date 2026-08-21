import { and, asc, eq, isNull } from "drizzle-orm"
import { type Dish, dishes, restaurants } from "../../db/schema"
import { type SessionContext, type Tx, withTenant } from "../../db/tx"
import { ApiError } from "../../shared/api-error"
import type { DishInput } from "./catalog.schema"

export type RestaurantScope = SessionContext & { restaurantId: string }

const dishColumns = (input: DishInput) => ({
	name: input.name,
	category: input.category,
	servingUnit: input.servingUnit,
	avgServingWeightG: input.avgServingWeightG > 0 ? String(input.avgServingWeightG) : null,
	sellingPrice: String(input.sellingPrice),
	costPerUnit: String(input.costPerUnit),
	shelfLifeHours: input.shelfLifeHours,
	isReusable: input.isReusable,
	reuseRoute: input.reuseRoute,
})

export const resolveRestaurantId = async (tx: Tx, ctx: SessionContext): Promise<string> => {
	const scoped = ctx as RestaurantScope
	if (scoped.restaurantId != null && scoped.restaurantId !== "") return scoped.restaurantId

	const rows = await tx.select({ id: restaurants.id }).from(restaurants).limit(1)
	const id = rows[0]?.id ?? ""
	if (id === "") {
		throw new ApiError("RESOURCE_NOT_FOUND", "This account has no restaurant set up yet.")
	}
	return id
}

export const selectActiveDishes = async (ctx: SessionContext): Promise<Dish[]> =>
	withTenant(ctx, (tx) =>
		tx.select().from(dishes).where(isNull(dishes.archivedAt)).orderBy(asc(dishes.name)),
	)

export const insertDish = async (
	ctx: SessionContext,
	input: DishInput,
	createdAt: Date,
): Promise<Dish> =>
	withTenant(ctx, async (tx) => {
		const restaurantId = await resolveRestaurantId(tx, ctx)
		const rows = await tx
			.insert(dishes)
			.values({ tenantId: ctx.tenantId, restaurantId, createdAt, ...dishColumns(input) })
			.returning()

		const created = rows[0] ?? null
		if (created == null) throw new ApiError("INTERNAL", "The dish could not be saved.")
		return created
	})

export const updateActiveDish = async (
	ctx: SessionContext,
	id: string,
	input: DishInput,
): Promise<Dish | null> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.update(dishes)
			.set(dishColumns(input))
			.where(and(eq(dishes.id, id), isNull(dishes.archivedAt)))
			.returning()

		return rows[0] ?? null
	})

export const markDishArchived = async (
	ctx: SessionContext,
	id: string,
	archivedAt: Date,
): Promise<boolean> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx
			.update(dishes)
			.set({ archivedAt })
			.where(and(eq(dishes.id, id), isNull(dishes.archivedAt)))
			.returning({ id: dishes.id })

		return rows.length > 0
	})
