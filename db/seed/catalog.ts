import { type SQL, sql } from "drizzle-orm"
import type { ServingUnit } from "../../apps/main-service/src/db/schema"
import { type SessionContext, withSystem, withTenant } from "../../apps/main-service/src/db/tx"
import type { Clock } from "../../apps/main-service/src/shared/clock"

export type KitchenContext = {
	tenantId: string
	restaurantId: string
	ownerUserId: string
	buyerTenantId: string
	ngoTenantId: string
}

export type IngredientSpec = {
	name: string
	category: string
	baseUnit: string
	pieceWeightG: number
	costPerBaseUnit: number
	lotSizeBase: number
	keepsDays: number
	purchaseEveryDays: number
}

export type DishSpec = {
	name: string
	category: string
	servingUnit: ServingUnit
	avgServingWeightG: number
	sellingPrice: number
	costPerUnit: number
	shelfLifeHours: number
	isReusable: boolean
	reuseRoute: string
	dailyBase: number
	weekdayFactor: number[]
}

export type CatalogCounts = {
	ingredients: number
	dishes: number
}

const OWNER_EMAIL = "asha@spiceroute.local"
const BUYER_EMAIL = "meera@annatiffin.local"
const NGO_EMAIL = "ravi@akshaya.local"

const WEEKEND_HEAVY = [1.3, 0.8, 0.84, 0.86, 0.9, 1.05, 1.25]
const STEADY = [1.12, 0.94, 0.95, 0.96, 0.98, 1.03, 1.02]
const TIFFIN = [1.18, 0.95, 0.94, 0.95, 0.96, 1.02, 1.0]

export const INGREDIENT_SPECS: IngredientSpec[] = [
	{
		name: "Basmati Rice",
		category: "cereals",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.115,
		lotSizeBase: 25000,
		keepsDays: 180,
		purchaseEveryDays: 6,
	},
	{
		name: "Sona Masuri Rice",
		category: "cereals",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.062,
		lotSizeBase: 40000,
		keepsDays: 180,
		purchaseEveryDays: 7,
	},
	{
		name: "Wheat Flour",
		category: "cereals",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.048,
		lotSizeBase: 20000,
		keepsDays: 90,
		purchaseEveryDays: 5,
	},
	{
		name: "Onion",
		category: "vegetables",
		baseUnit: "g",
		pieceWeightG: 110,
		costPerBaseUnit: 0.034,
		lotSizeBase: 30000,
		keepsDays: 21,
		purchaseEveryDays: 4,
	},
	{
		name: "Tomato",
		category: "vegetables",
		baseUnit: "g",
		pieceWeightG: 95,
		costPerBaseUnit: 0.042,
		lotSizeBase: 18000,
		keepsDays: 8,
		purchaseEveryDays: 3,
	},
	{
		name: "Potato",
		category: "vegetables",
		baseUnit: "g",
		pieceWeightG: 130,
		costPerBaseUnit: 0.028,
		lotSizeBase: 25000,
		keepsDays: 30,
		purchaseEveryDays: 5,
	},
	{
		name: "Green Peas",
		category: "vegetables",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.086,
		lotSizeBase: 8000,
		keepsDays: 12,
		purchaseEveryDays: 4,
	},
	{
		name: "Lemon",
		category: "fruits",
		baseUnit: "g",
		pieceWeightG: 55,
		costPerBaseUnit: 0.11,
		lotSizeBase: 3000,
		keepsDays: 14,
		purchaseEveryDays: 4,
	},
	{
		name: "Toor Dal",
		category: "legumes",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.148,
		lotSizeBase: 12000,
		keepsDays: 240,
		purchaseEveryDays: 6,
	},
	{
		name: "Chana Dal",
		category: "legumes",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.096,
		lotSizeBase: 10000,
		keepsDays: 240,
		purchaseEveryDays: 7,
	},
	{
		name: "Rajma",
		category: "legumes",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.132,
		lotSizeBase: 8000,
		keepsDays: 240,
		purchaseEveryDays: 8,
	},
	{
		name: "Sunflower Oil",
		category: "oils",
		baseUnit: "ml",
		pieceWeightG: 0,
		costPerBaseUnit: 0.145,
		lotSizeBase: 15000,
		keepsDays: 300,
		purchaseEveryDays: 6,
	},
	{
		name: "Curd",
		category: "dairy",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.072,
		lotSizeBase: 10000,
		keepsDays: 6,
		purchaseEveryDays: 2,
	},
	{
		name: "Milk",
		category: "dairy",
		baseUnit: "ml",
		pieceWeightG: 0,
		costPerBaseUnit: 0.058,
		lotSizeBase: 12000,
		keepsDays: 4,
		purchaseEveryDays: 2,
	},
	{
		name: "Paneer",
		category: "cheese",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.36,
		lotSizeBase: 6000,
		keepsDays: 8,
		purchaseEveryDays: 3,
	},
	{
		name: "Hen Egg",
		category: "eggs",
		baseUnit: "g",
		pieceWeightG: 50,
		costPerBaseUnit: 0.13,
		lotSizeBase: 6000,
		keepsDays: 21,
		purchaseEveryDays: 4,
	},
	{
		name: "Chicken",
		category: "poultry",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.27,
		lotSizeBase: 15000,
		keepsDays: 3,
		purchaseEveryDays: 2,
	},
	{
		name: "Mutton",
		category: "mutton",
		baseUnit: "g",
		pieceWeightG: 0,
		costPerBaseUnit: 0.78,
		lotSizeBase: 8000,
		keepsDays: 3,
		purchaseEveryDays: 3,
	},
]

export const DISH_SPECS: DishSpec[] = [
	{
		name: "Veg Biryani",
		category: "rice",
		servingUnit: "plate",
		avgServingWeightG: 350,
		sellingPrice: 220,
		costPerUnit: 82,
		shelfLifeHours: 14,
		isReusable: true,
		reuseRoute: "fried rice",
		dailyBase: 46,
		weekdayFactor: STEADY,
	},
	{
		name: "Chicken Biryani",
		category: "rice",
		servingUnit: "plate",
		avgServingWeightG: 380,
		sellingPrice: 320,
		costPerUnit: 138,
		shelfLifeHours: 14,
		isReusable: true,
		reuseRoute: "fried rice",
		dailyBase: 52,
		weekdayFactor: WEEKEND_HEAVY,
	},
	{
		name: "Jeera Rice",
		category: "rice",
		servingUnit: "plate",
		avgServingWeightG: 250,
		sellingPrice: 140,
		costPerUnit: 44,
		shelfLifeHours: 14,
		isReusable: true,
		reuseRoute: "fried rice",
		dailyBase: 38,
		weekdayFactor: STEADY,
	},
	{
		name: "Dal Tadka",
		category: "legume",
		servingUnit: "plate",
		avgServingWeightG: 300,
		sellingPrice: 160,
		costPerUnit: 52,
		shelfLifeHours: 16,
		isReusable: true,
		reuseRoute: "dal fry",
		dailyBase: 44,
		weekdayFactor: STEADY,
	},
	{
		name: "Rajma Masala",
		category: "legume",
		servingUnit: "plate",
		avgServingWeightG: 300,
		sellingPrice: 185,
		costPerUnit: 66,
		shelfLifeHours: 16,
		isReusable: true,
		reuseRoute: "dal fry",
		dailyBase: 30,
		weekdayFactor: STEADY,
	},
	{
		name: "Chana Masala",
		category: "legume",
		servingUnit: "plate",
		avgServingWeightG: 300,
		sellingPrice: 175,
		costPerUnit: 58,
		shelfLifeHours: 16,
		isReusable: true,
		reuseRoute: "chana chaat",
		dailyBase: 28,
		weekdayFactor: STEADY,
	},
	{
		name: "Paneer Butter Masala",
		category: "curry",
		servingUnit: "plate",
		avgServingWeightG: 280,
		sellingPrice: 265,
		costPerUnit: 108,
		shelfLifeHours: 12,
		isReusable: true,
		reuseRoute: "paneer kathi roll",
		dailyBase: 34,
		weekdayFactor: STEADY,
	},
	{
		name: "Mutton Rogan Josh",
		category: "curry",
		servingUnit: "plate",
		avgServingWeightG: 300,
		sellingPrice: 395,
		costPerUnit: 192,
		shelfLifeHours: 12,
		isReusable: true,
		reuseRoute: "mutton pulao",
		dailyBase: 18,
		weekdayFactor: WEEKEND_HEAVY,
	},
	{
		name: "Chicken Curry",
		category: "curry",
		servingUnit: "plate",
		avgServingWeightG: 300,
		sellingPrice: 285,
		costPerUnit: 122,
		shelfLifeHours: 12,
		isReusable: true,
		reuseRoute: "chicken pulao",
		dailyBase: 40,
		weekdayFactor: WEEKEND_HEAVY,
	},
	{
		name: "Mixed Veg Sabzi",
		category: "curry",
		servingUnit: "plate",
		avgServingWeightG: 260,
		sellingPrice: 155,
		costPerUnit: 49,
		shelfLifeHours: 14,
		isReusable: true,
		reuseRoute: "veg pulao",
		dailyBase: 32,
		weekdayFactor: STEADY,
	},
	{
		name: "Masala Dosa",
		category: "tiffin",
		servingUnit: "plate",
		avgServingWeightG: 220,
		sellingPrice: 115,
		costPerUnit: 36,
		shelfLifeHours: 6,
		isReusable: false,
		reuseRoute: "",
		dailyBase: 36,
		weekdayFactor: TIFFIN,
	},
	{
		name: "Tandoori Roti",
		category: "bread",
		servingUnit: "piece",
		avgServingWeightG: 55,
		sellingPrice: 25,
		costPerUnit: 8,
		shelfLifeHours: 8,
		isReusable: false,
		reuseRoute: "",
		dailyBase: 120,
		weekdayFactor: TIFFIN,
	},
]

export const kitchenSession = (context: KitchenContext): SessionContext => ({
	tenantId: context.tenantId,
	tenantType: "restaurant",
	role: "owner",
	userId: context.ownerUserId,
})

const tenantByOwnerEmail = async (name: string, email: string) =>
	withSystem(async (tx) => {
		const rows = await tx.execute(sql`
			select t.id as tenant_id, u.id as user_id
			from tenants t
			join users u on u.tenant_id = t.id
			where t.name = ${name} and u.email = ${email}
			limit 1
		`)
		const row = rows[0]
		if (row == null) {
			throw new Error(`Identity seeding did not create ${name} (${email})`)
		}
		return { tenantId: String(row.tenant_id), userId: String(row.user_id) }
	})

export const resolveKitchenContext = async (): Promise<KitchenContext> => {
	const kitchen = await tenantByOwnerEmail("Spice Route", OWNER_EMAIL)
	const buyer = await tenantByOwnerEmail("Anna Tiffin", BUYER_EMAIL)
	const ngo = await tenantByOwnerEmail("Akshaya Trust", NGO_EMAIL)

	const restaurantId = await withTenant(
		{ tenantId: kitchen.tenantId, tenantType: "restaurant", role: "owner", userId: kitchen.userId },
		async (tx) => {
			const rows = await tx.execute(sql`
				select id from restaurants where tenant_id = ${kitchen.tenantId} limit 1
			`)
			const row = rows[0]
			if (row == null) {
				throw new Error("Spice Route has no restaurant row")
			}
			return String(row.id)
		},
	)

	return {
		tenantId: kitchen.tenantId,
		restaurantId,
		ownerUserId: kitchen.userId,
		buyerTenantId: buyer.tenantId,
		ngoTenantId: ngo.tenantId,
	}
}

export const chunked = <T>(items: T[], size: number): T[][] => {
	const out: T[][] = []
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size))
	}
	return out
}

export const valueList = (rows: SQL[]): SQL => sql.join(rows, sql`, `)

export const seedCatalog = async (clock: Clock): Promise<CatalogCounts> => {
	const context = await resolveKitchenContext()
	const createdAt = clock.now().toISOString()

	return withTenant(kitchenSession(context), async (tx) => {
		const ingredientValues = INGREDIENT_SPECS.map(
			(spec) => sql`(
				${context.tenantId}, ${context.restaurantId}, ${spec.name}, ${spec.category},
				${spec.baseUnit}, ${spec.pieceWeightG > 0 ? spec.pieceWeightG.toFixed(2) : null},
				${createdAt}
			)`,
		)
		await tx.execute(sql`
			insert into ingredients
				(tenant_id, restaurant_id, name, category, base_unit, piece_weight_g, created_at)
			values ${valueList(ingredientValues)}
		`)

		const dishValues = DISH_SPECS.map(
			(spec) => sql`(
				${context.tenantId}, ${context.restaurantId}, ${spec.name}, ${spec.category},
				${spec.servingUnit}::serving_unit, ${spec.avgServingWeightG.toFixed(2)},
				${spec.sellingPrice.toFixed(2)}, ${spec.costPerUnit.toFixed(2)},
				${spec.shelfLifeHours}, ${spec.isReusable}, ${spec.reuseRoute}, ${createdAt}
			)`,
		)
		await tx.execute(sql`
			insert into dishes
				(tenant_id, restaurant_id, name, category, serving_unit, avg_serving_weight_g,
				 selling_price, cost_per_unit, shelf_life_hours, is_reusable, reuse_route, created_at)
			values ${valueList(dishValues)}
		`)

		const dishRows = await tx.execute(sql`
			select id, name from dishes where restaurant_id = ${context.restaurantId}
		`)
		const dishIdByName = new Map(dishRows.map((row) => [String(row.name), String(row.id)]))

		const ingredientRows = await tx.execute(sql`
			select id, name from ingredients where restaurant_id = ${context.restaurantId}
		`)
		const ingredientIdByName = new Map(
			ingredientRows.map((row) => [String(row.name), String(row.id)]),
		)

		const supplierValues: SQL[] = [
			sql`(
				${context.tenantId}, 'Sai Provision Stores', 'Ravi Kumar',
				'+91-98456-11122', 'ravi@saiprovision.local', 'No 14, 2nd Cross, Gandhi Bazaar, Bengaluru',
				${createdAt}
			)`,
			sql`(
				${context.tenantId}, 'Annapurna Agro', 'Lakshmi Devi',
				'+91-98456-22233', 'lakshmi@annapurna.local', 'Plot 9, APMC Yard, Yeshwantpur, Bengaluru',
				${createdAt}
			)`,
			sql`(
				${context.tenantId}, 'Krishna Dairy', 'Suresh Rao',
				'+91-98456-33344', 'suresh@krishnadairy.local', '8th Main, Rajajinagar, Bengaluru',
				${createdAt}
			)`,
		]
		await tx.execute(sql`
			insert into suppliers
				(tenant_id, name, contact_name, contact_phone, contact_email, address_line, created_at)
			values ${valueList(supplierValues)}
		`)

		const recipeValues: SQL[] = []
		for (const spec of DISH_SPECS) {
			const dishId = dishIdByName.get(spec.name)
			if (dishId == null) continue
			for (const item of recipeIngredientsFor(spec)) {
				const ingredientId = ingredientIdByName.get(item.ingredientName)
				if (ingredientId == null) continue
				recipeValues.push(sql`(
					${context.tenantId}, ${dishId}, ${ingredientId},
					${item.qtyPerServing.toFixed(3)}, ${item.unit}, ${createdAt}
				)`)
			}
		}
		if (recipeValues.length > 0) {
			await tx.execute(sql`
				insert into dish_ingredients
					(tenant_id, dish_id, ingredient_id, qty_per_serving, unit, created_at)
				values ${valueList(recipeValues)}
			`)
		}

		return { ingredients: INGREDIENT_SPECS.length, dishes: DISH_SPECS.length }
	})
}

const recipeIngredientsFor = (
	spec: DishSpec,
): { ingredientName: string; qtyPerServing: number; unit: string }[] => {
	switch (spec.name) {
		case "Veg Biryani":
		case "Chicken Biryani":
		case "Jeera Rice":
			return [
				{
					ingredientName: spec.name.includes("Chicken") ? "Basmati Rice" : "Basmati Rice",
					qtyPerServing: 180,
					unit: "g",
				},
				{ ingredientName: "Onion", qtyPerServing: 60, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 20, unit: "ml" },
			]
		case "Dal Tadka":
			return [
				{ ingredientName: "Toor Dal", qtyPerServing: 110, unit: "g" },
				{ ingredientName: "Onion", qtyPerServing: 40, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 15, unit: "ml" },
			]
		case "Rajma Masala":
			return [
				{ ingredientName: "Rajma", qtyPerServing: 120, unit: "g" },
				{ ingredientName: "Onion", qtyPerServing: 40, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 15, unit: "ml" },
			]
		case "Chana Masala":
			return [
				{ ingredientName: "Chana Dal", qtyPerServing: 120, unit: "g" },
				{ ingredientName: "Onion", qtyPerServing: 40, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 15, unit: "ml" },
			]
		case "Paneer Butter Masala":
			return [
				{ ingredientName: "Paneer", qtyPerServing: 100, unit: "g" },
				{ ingredientName: "Tomato", qtyPerServing: 60, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 15, unit: "ml" },
			]
		case "Mutton Rogan Josh":
			return [
				{ ingredientName: "Mutton", qtyPerServing: 180, unit: "g" },
				{ ingredientName: "Onion", qtyPerServing: 50, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 20, unit: "ml" },
			]
		case "Chicken Curry":
			return [
				{ ingredientName: "Chicken", qtyPerServing: 180, unit: "g" },
				{ ingredientName: "Onion", qtyPerServing: 50, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 20, unit: "ml" },
			]
		case "Mixed Veg Sabzi":
			return [
				{ ingredientName: "Potato", qtyPerServing: 80, unit: "g" },
				{ ingredientName: "Tomato", qtyPerServing: 60, unit: "g" },
				{ ingredientName: "Onion", qtyPerServing: 40, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 15, unit: "ml" },
			]
		case "Masala Dosa":
			return [
				{ ingredientName: "Wheat Flour", qtyPerServing: 70, unit: "g" },
				{ ingredientName: "Potato", qtyPerServing: 90, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 10, unit: "ml" },
			]
		case "Tandoori Roti":
			return [
				{ ingredientName: "Wheat Flour", qtyPerServing: 55, unit: "g" },
				{ ingredientName: "Sunflower Oil", qtyPerServing: 3, unit: "ml" },
			]
		default:
			return []
	}
}
