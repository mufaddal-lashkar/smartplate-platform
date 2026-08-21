import { sql } from "drizzle-orm"
import type { SessionContext } from "../../src/db/tx"
import { withTenant } from "../../src/db/tx"
import { fixedClock } from "../../src/shared/clock"
import { makeTenant } from "./db"

export type RestaurantContext = SessionContext & { restaurantId: string }

export const testClock = fixedClock("2026-08-02T20:00:00Z")

export const makeRestaurantTenant = async (): Promise<RestaurantContext> => {
	const tenant = await makeTenant("restaurant")
	const suffix = crypto.randomUUID().slice(0, 8)
	const ctx: SessionContext = {
		tenantId: tenant.id,
		tenantType: "restaurant",
		role: "owner",
		userId: tenant.ownerId,
	}

	const restaurantId = await withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into restaurants (tenant_id, name)
			values (${tenant.id}, ${`Test Kitchen ${suffix}`})
			returning id
		`)
		return String(rows[0]?.id)
	})

	return { ...ctx, restaurantId }
}

export type DishSpec = {
	name: string
	servingUnit: "kg" | "plate" | "piece" | "litre"
	avgServingWeightG: number
	sellingPrice: number
	costPerUnit: number
	shelfLifeHours: number
	isReusable: boolean
	reuseRoute: string
}

export const BIRYANI: DishSpec = {
	name: "Veg Biryani",
	servingUnit: "plate",
	avgServingWeightG: 320,
	sellingPrice: 220,
	costPerUnit: 74,
	shelfLifeHours: 24,
	isReusable: true,
	reuseRoute: "fried rice",
}

export const RICE_KG: DishSpec = {
	name: "Steamed Rice",
	servingUnit: "kg",
	avgServingWeightG: 0,
	sellingPrice: 120,
	costPerUnit: 42,
	shelfLifeHours: 24,
	isReusable: true,
	reuseRoute: "fried rice",
}

export const insertDish = async (
	ctx: RestaurantContext,
	spec: DishSpec = BIRYANI,
): Promise<string> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into dishes (
				tenant_id, restaurant_id, name, category, serving_unit,
				avg_serving_weight_g, selling_price, cost_per_unit,
				shelf_life_hours, is_reusable, reuse_route
			) values (
				${ctx.tenantId}, ${ctx.restaurantId}, ${`${spec.name} ${crypto.randomUUID().slice(0, 6)}`},
				'main', ${spec.servingUnit}::serving_unit,
				${spec.avgServingWeightG === 0 ? null : spec.avgServingWeightG},
				${spec.sellingPrice}, ${spec.costPerUnit},
				${spec.shelfLifeHours}, ${spec.isReusable}, ${spec.reuseRoute}
			) returning id
		`)
		return String(rows[0]?.id)
	})

export type PrepSpec = {
	dishId: string
	serviceDate: string
	qtyPrepared: number
	qtyServed: number
}

export const insertPrepEntry = async (ctx: RestaurantContext, spec: PrepSpec): Promise<string> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into prep_entries (
				tenant_id, restaurant_id, dish_id, service_date, meal_period,
				qty_prepared, qty_served, prepared_at
			) values (
				${ctx.tenantId}, ${ctx.restaurantId}, ${spec.dishId}, ${spec.serviceDate}, 'dinner',
				${spec.qtyPrepared}, ${spec.qtyServed}, ${`${spec.serviceDate}T20:00:00Z`}
			) returning id
		`)
		return String(rows[0]?.id)
	})

export type LeftoverSpec = {
	dishId: string
	serviceDate: string
	qty: number
	unit: "kg" | "plate" | "piece" | "litre"
	prepEntryId: string
}

export const insertLeftover = async (ctx: RestaurantContext, spec: LeftoverSpec): Promise<string> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into leftovers (
				tenant_id, restaurant_id, dish_id, prep_entry_id, service_date,
				qty, unit, storage, prepared_at, safe_until, status
			) values (
				${ctx.tenantId}, ${ctx.restaurantId}, ${spec.dishId},
				${spec.prepEntryId === "" ? null : spec.prepEntryId},
				${spec.serviceDate}, ${spec.qty}, ${spec.unit}::serving_unit,
				'refrigerated', ${`${spec.serviceDate}T20:00:00Z`},
				${`${spec.serviceDate}T20:00:00Z`}::timestamptz + interval '72 hours',
				'pending_disposition'
			) returning id
		`)
		return String(rows[0]?.id)
	})

export type DispositionSpec = {
	leftoverId: string
	retainQty: number
	sellQty: number
	donateQty: number
	wasteQty: number
	sellPricePerUnit: number
}

export const insertDisposition = async (
	ctx: RestaurantContext,
	spec: DispositionSpec,
): Promise<void> => {
	await withTenant(ctx, async (tx) => {
		await tx.execute(sql`
			insert into leftover_dispositions (
				tenant_id, leftover_id, retain_qty, sell_qty, donate_qty, waste_qty,
				sell_price_per_unit, ai_suggested_retain_qty, decided_by_user_id, decided_at
			) values (
				${ctx.tenantId}, ${spec.leftoverId}, ${spec.retainQty}, ${spec.sellQty},
				${spec.donateQty}, ${spec.wasteQty}, ${spec.sellPricePerUnit},
				${spec.retainQty}, ${ctx.userId}, now()
			)
		`)
		await tx.execute(sql`
			update leftovers set status = 'closed' where id = ${spec.leftoverId}
		`)
	})
}

export const insertOpenB2bListing = async (
	ctx: RestaurantContext,
	options: { qty: number; pricePerUnit: number; leftoverId: string },
): Promise<string> =>
	withTenant(ctx, async (tx) => {
		const rows = await tx.execute(sql`
			insert into surplus_listings (
				tenant_id, restaurant_id, channel, status, qty, unit, price_per_unit,
				pickup_from, pickup_until, safe_until, escalate_at
			) values (
				${ctx.tenantId}, ${ctx.restaurantId}, 'b2b', 'open',
				${options.qty}, 'kg'::serving_unit, ${options.pricePerUnit},
				now(), now() + interval '6 hours', now() + interval '12 hours',
				now() + interval '30 seconds'
			) returning id
		`)
		const listingId = String(rows[0]?.id)

		await tx.execute(sql`
			insert into listing_items (tenant_id, listing_id, leftover_id, qty)
			values (${ctx.tenantId}, ${listingId}, ${options.leftoverId}, ${options.qty})
		`)
		await tx.execute(sql`
			insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
			values (${ctx.tenantId}, ${listingId}, 'created', '', now())
		`)

		return listingId
	})

export type KnownDay = {
	serviceDate: string
	prepared: number
	leftover: number
	reused: number
	sold: number
	donated: number
	binned: number
}

export const seedKnownDay = async (ctx: RestaurantContext, day: KnownDay): Promise<void> => {
	const dishId = await insertDish(ctx, RICE_KG)

	const prepEntryId = await insertPrepEntry(ctx, {
		dishId,
		serviceDate: day.serviceDate,
		qtyPrepared: day.prepared,
		qtyServed: day.prepared - day.leftover,
	})

	const leftoverId = await insertLeftover(ctx, {
		dishId,
		serviceDate: day.serviceDate,
		qty: day.leftover,
		unit: "kg",
		prepEntryId,
	})

	await insertDisposition(ctx, {
		leftoverId,
		retainQty: day.reused,
		sellQty: day.sold,
		donateQty: day.donated,
		wasteQty: day.binned,
		sellPricePerUnit: day.sold > 0 ? 50 : 0,
	})

	if (day.sold > 0) {
		await insertOpenB2bListing(ctx, {
			qty: day.sold,
			pricePerUnit: 50,
			leftoverId,
		})
	}
}
