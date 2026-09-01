import type { Dayjs } from "dayjs"
import { type SQL, sql } from "drizzle-orm"
import type { ServingUnit, StorageMethod } from "../../apps/main-service/src/db/schema"
import { type Tx, withTenant } from "../../apps/main-service/src/db/tx"
import type { Clock } from "../../apps/main-service/src/shared/clock"
import { STORAGE_MODIFIER } from "../../apps/main-service/src/shared/food-safety"
import {
	chunked,
	DISH_SPECS,
	type DishSpec,
	INGREDIENT_SPECS,
	type IngredientSpec,
	type KitchenContext,
	kitchenSession,
	resolveKitchenContext,
	valueList,
} from "./catalog"

export type HistorySummary = {
	days: number
	lots: number
	movements: number
	prepEntries: number
	leftovers: number
	dispositions: number
	predictions: number
	reuseConfirmations: number
	listings: number
	outcomes: Record<string, number>
}

const HISTORY_SEED = 20260802
const WINDOW_DAYS = 90
const BELIEF_WINDOW = 7
const OVER_PREP = 1.2
const DEMAND_SIGMA = 0.13
const RECORD_THRESHOLD = 0.5
const NGO_BUFFER_HOURS = 4
const MIN_B2B_WINDOW_HOURS = 2
const NGO_PICKUP_ODDS = 0.35
const RETENTION_FAILURE_ODDS = 0.15
const B2B_DISCOUNT = 0.45
const CHUNK = 400

type MealPeriod = {
	name: string
	share: number
	preparedMinutes: number
	decidedMinutes: number
}

const PENDING_PREPARED_HOURS_AGO: Record<string, number> = {
	lunch: 5,
	dinner: 2,
}

const MEAL_PERIODS: MealPeriod[] = [
	{ name: "lunch", share: 0.55, preparedMinutes: 660, decidedMinutes: 900 },
	{ name: "dinner", share: 0.45, preparedMinutes: 1140, decidedMinutes: 1350 },
]

const createRng = (seed: number): (() => number) => {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const gaussian = (rng: () => number): number =>
	Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())

const nextUuid = (rng: () => number): string => {
	const bytes: number[] = []
	for (let i = 0; i < 16; i += 1) {
		bytes.push(Math.floor(rng() * 256))
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("")
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		hex.slice(12, 16),
		hex.slice(16, 20),
		hex.slice(20, 32),
	].join("-")
}

const shuffled = <T>(rng: () => number, items: T[]): T[] => {
	const out = [...items]
	for (let i = out.length - 1; i > 0; i -= 1) {
		const j = Math.floor(rng() * (i + 1))
		const a = out[i]
		out[i] = out[j]
		out[j] = a
	}
	return out
}

const q2 = (n: number): string => n.toFixed(2)
const q3 = (n: number): string => n.toFixed(3)
const q4 = (n: number): string => n.toFixed(4)
const round3 = (n: number): number => Math.round(n * 1000) / 1000
const round4 = (n: number): number => Math.round(n * 10000) / 10000
const ts = (at: Dayjs): string => at.toISOString()

type MenuDish = DishSpec & { id: string }
type StockItem = IngredientSpec & { id: string }

type PlannedLeftover = {
	id: string
	dish: MenuDish
	period: MealPeriod
	prepEntryId: string
	dayIndex: number
	serviceDate: string
	qty: number
	storage: StorageMethod
	preparedAt: Dayjs
	safeUntil: Dayjs
	decidedAt: Dayjs
	pending: boolean
	retainQty: number
	sellQty: number
	donateQty: number
	wasteQty: number
	suggestion: number[]
	basis: string
}

type ListingBucket = {
	key: string
	channel: "b2b" | "ngo"
	unit: ServingUnit
	dayIndex: number
	periodName: string
	createdAt: Dayjs
	safeUntil: Dayjs
	qty: number
	priceWeight: number
	items: { leftoverId: string; qty: number }[]
}

type ListingOutcome = "sold" | "escalated_claimed" | "claimed_direct" | "expired" | "no_show"

const loadMenu = async (tx: Tx, context: KitchenContext): Promise<MenuDish[]> => {
	const rows = await tx.execute(sql`
		select id, name from dishes where restaurant_id = ${context.restaurantId}
	`)
	const byName = new Map(rows.map((row) => [String(row.name), String(row.id)]))
	return DISH_SPECS.map((spec) => {
		const id = byName.get(spec.name)
		if (id == null) {
			throw new Error(`Catalog is missing the dish ${spec.name}`)
		}
		return { ...spec, id }
	})
}

const loadStock = async (tx: Tx, context: KitchenContext): Promise<StockItem[]> => {
	const rows = await tx.execute(sql`
		select id, name from ingredients where restaurant_id = ${context.restaurantId}
	`)
	const byName = new Map(rows.map((row) => [String(row.name), String(row.id)]))
	return INGREDIENT_SPECS.map((spec) => {
		const id = byName.get(spec.name)
		if (id == null) {
			throw new Error(`Catalog is missing the ingredient ${spec.name}`)
		}
		return { ...spec, id }
	})
}

const writeChunks = async (tx: Tx, rows: SQL[], statement: (values: SQL) => SQL) => {
	for (const chunk of chunked(rows, CHUNK)) {
		await tx.execute(statement(valueList(chunk)))
	}
}

const assignOutcomes = (rng: () => number, all: ListingBucket[]): Map<string, ListingOutcome> => {
	const total = all.length
	const wanted: [ListingOutcome, number][] = [
		["sold", Math.round(total * 0.3)],
		["escalated_claimed", Math.round(total * 0.25)],
		["claimed_direct", Math.round(total * 0.2)],
		["expired", Math.round(total * 0.2)],
	]
	const assigned = new Map<string, ListingOutcome>()
	const b2b = shuffled(
		rng,
		all.filter((bucket) => bucket.channel === "b2b"),
	)
	const ngo = shuffled(
		rng,
		all.filter((bucket) => bucket.channel === "ngo"),
	)

	const take = (pool: ListingBucket[], outcome: ListingOutcome, count: number): ListingBucket[] => {
		const used = Math.min(count, pool.length)
		for (let i = 0; i < used; i += 1) {
			assigned.set(pool[i].key, outcome)
		}
		return pool.slice(used)
	}

	let remainingB2b = take(b2b, "sold", wanted[0][1])
	remainingB2b = take(remainingB2b, "escalated_claimed", wanted[1][1])
	const remainingNgo = take(ngo, "claimed_direct", wanted[2][1])

	const rest = shuffled(rng, [...remainingB2b, ...remainingNgo])
	const expiring = Math.min(wanted[3][1], rest.length)
	for (let i = 0; i < rest.length; i += 1) {
		assigned.set(rest[i].key, i < expiring ? "expired" : "no_show")
	}
	return assigned
}

export const seedHistory = async (clock: Clock): Promise<HistorySummary> => {
	const context = await resolveKitchenContext()
	const rng = createRng(HISTORY_SEED)
	const lastDay = clock.now().startOf("day")
	const firstDay = lastDay.subtract(WINDOW_DAYS - 1, "day")

	return withTenant(kitchenSession(context), async (tx) => {
		const menu = await loadMenu(tx, context)
		const stock = await loadStock(tx, context)

		const lotValues: SQL[] = []
		const movementValues: SQL[] = []

		stock.forEach((item, index) => {
			for (let d = index % item.purchaseEveryDays; d < WINDOW_DAYS; d += item.purchaseEveryDays) {
				const day = firstDay.add(d, "day")
				const purchased = round3(item.lotSizeBase * (0.85 + 0.3 * rng()))
				const unitCost = round4(item.costPerBaseUnit * (0.9 + 0.22 * rng()))
				const drained = WINDOW_DAYS - 1 - d > 10
				const consumedTotal = round3(purchased * (drained ? 1 : 0.4 + 0.5 * rng()))
				const steps = 2 + Math.floor(rng() * 3)
				const lotId = nextUuid(rng)

				lotValues.push(sql`(
					${lotId}, ${context.tenantId}, ${context.restaurantId}, ${item.id},
					${q3(purchased)}, ${q3(round3(purchased - consumedTotal))}, ${q4(unitCost)},
					${day.format("YYYY-MM-DD")}, ${day.add(item.keepsDays, "day").format("YYYY-MM-DD")},
					${ts(day.add(7, "hour"))}
				)`)
				movementValues.push(sql`(
					${context.tenantId}, ${context.restaurantId}, ${lotId}, ${item.id},
					${q3(purchased)}, 'purchase', ${ts(day.add(7, "hour"))}
				)`)

				const parts: number[] = []
				let drawn = 0
				for (let step = 0; step < steps - 1; step += 1) {
					const part = round3((consumedTotal / steps) * (0.7 + 0.6 * rng()))
					parts.push(part)
					drawn = round3(drawn + part)
				}
				parts.push(round3(consumedTotal - drawn))

				parts.forEach((part, step) => {
					const at = firstDay
						.add(Math.min(d + 1 + step, WINDOW_DAYS - 1), "day")
						.add(10 + step, "hour")
					movementValues.push(sql`(
						${context.tenantId}, ${context.restaurantId}, ${lotId}, ${item.id},
						${q3(-part)}, 'consumption', ${ts(at)}
					)`)
				})
			}
		})

		const series = menu.flatMap((dish) =>
			MEAL_PERIODS.map((period) => ({
				dish,
				period,
				base: dish.dailyBase * period.share,
				demand: [] as number[],
			})),
		)

		const prepValues: SQL[] = []
		const planned: PlannedLeftover[] = []
		const buckets = new Map<string, ListingBucket>()

		for (let d = 0; d < WINDOW_DAYS; d += 1) {
			const day = firstDay.add(d, "day")
			const weekday = day.day()
			const pending = d === WINDOW_DAYS - 1
			const pickupByPeriod = new Map(
				MEAL_PERIODS.map((period) => [period.name, rng() < NGO_PICKUP_ODDS]),
			)

			for (const line of series) {
				const dish = line.dish
				const period = line.period
				const noise = Math.exp(gaussian(rng) * DEMAND_SIGMA)
				const demand = line.base * dish.weekdayFactor[weekday] * noise
				const recent = line.demand.slice(-BELIEF_WINDOW)
				const belief =
					recent.length < BELIEF_WINDOW
						? line.base
						: recent.reduce((sum, value) => sum + value, 0) / recent.length
				line.demand.push(demand)

				const prepared = round3(belief * OVER_PREP)
				const leftover = round3(Math.max(0, prepared - demand))
				const served = round3(prepared - leftover)
				const preparedAt = pending
					? clock.now().subtract(PENDING_PREPARED_HOURS_AGO[period.name], "hour")
					: day.add(period.preparedMinutes, "minute")
				const prepEntryId = nextUuid(rng)

				prepValues.push(sql`(
					${prepEntryId}, ${context.tenantId}, ${context.restaurantId}, ${dish.id},
					${day.format("YYYY-MM-DD")}, ${period.name}, ${q3(prepared)}, ${q3(served)},
					${Math.max(1, Math.round(served / 1.8))}, ${ts(preparedAt)}
				)`)

				if (leftover < RECORD_THRESHOLD) {
					continue
				}

				const storage: StorageMethod = dish.isReusable ? "refrigerated" : "room_temp"
				const safeUntil = preparedAt.add(dish.shelfLifeHours * STORAGE_MODIFIER[storage], "hour")
				const decidedAt = day.add(period.decidedMinutes, "minute")
				const hoursLeft = safeUntil.diff(decidedAt, "minute") / 60
				const canDonate = hoursLeft >= NGO_BUFFER_HOURS
				const canSell = hoursLeft >= NGO_BUFFER_HOURS + MIN_B2B_WINDOW_HOURS
				const collecting = canDonate && pickupByPeriod.get(period.name) === true

				let retainShare = 0
				let sellShare = 0
				let donateShare = 0
				if (dish.isReusable) {
					retainShare = 0.34 + 0.12 * rng()
					sellShare = canSell ? 0.22 + 0.1 * rng() : 0
					donateShare = collecting ? 0.12 + 0.08 * rng() : 0
					if (!collecting && canSell) {
						sellShare += 0.12 + 0.08 * rng()
					}
				} else {
					donateShare = collecting ? 0.55 + 0.25 * rng() : 0
				}

				const plannedRetain = round3(leftover * retainShare)
				const reused = plannedRetain === 0 || rng() >= RETENTION_FAILURE_ODDS
				const retainQty = reused ? plannedRetain : 0
				const sellQty = round3(leftover * sellShare)
				const donateQty = round3(leftover * donateShare)
				const wasteQty = round3(leftover - retainQty - sellQty - donateQty)

				const spread = [
					plannedRetain,
					sellQty,
					donateQty,
					leftover - plannedRetain - sellQty - donateQty,
				]
				const jittered = spread.map((value) => Math.max(0, value * (1 + (rng() - 0.5) * 0.34)))
				const total = jittered.reduce((sum, value) => sum + value, 0)
				const scaled = jittered.map((value) => round3((value * leftover) / total))
				const suggestion = [
					scaled[0],
					scaled[1],
					scaled[2],
					Math.max(0, round3(leftover - scaled[0] - scaled[1] - scaled[2])),
				]

				const swing = Math.round((dish.weekdayFactor[weekday] - 1) * 100)
				const leftoverId = nextUuid(rng)

				planned.push({
					id: leftoverId,
					dish,
					period,
					prepEntryId,
					dayIndex: d,
					serviceDate: day.format("YYYY-MM-DD"),
					qty: leftover,
					storage,
					preparedAt,
					safeUntil,
					decidedAt,
					pending,
					retainQty,
					sellQty,
					donateQty,
					wasteQty,
					suggestion,
					basis: `${BELIEF_WINDOW}-day mean ${belief.toFixed(1)} ${dish.servingUnit}; ${day.format("dddd")} runs ${swing >= 0 ? "+" : ""}${swing}% against the week`,
				})

				if (pending) {
					continue
				}

				const listable: [number, "b2b" | "ngo"][] = [
					[sellQty, "b2b"],
					[donateQty, "ngo"],
				]
				for (const [qty, channel] of listable) {
					if (qty <= 0) {
						continue
					}
					const key = `${d}|${period.name}|${channel}|${dish.servingUnit}`
					const bucket = buckets.get(key) ?? {
						key,
						channel,
						unit: dish.servingUnit,
						dayIndex: d,
						periodName: period.name,
						createdAt: decidedAt,
						safeUntil,
						qty: 0,
						priceWeight: 0,
						items: [],
					}
					bucket.qty = round3(bucket.qty + qty)
					bucket.priceWeight += qty * dish.sellingPrice * B2B_DISCOUNT
					bucket.safeUntil = safeUntil.isBefore(bucket.safeUntil) ? safeUntil : bucket.safeUntil
					bucket.items.push({ leftoverId, qty })
					buckets.set(key, bucket)
				}
			}
		}

		const allBuckets = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
		const outcomes = assignOutcomes(rng, allBuckets)

		const leftoverValues = planned.map(
			(entry) => sql`(
				${entry.id}, ${context.tenantId}, ${context.restaurantId}, ${entry.dish.id},
				${entry.prepEntryId}, ${entry.serviceDate}, ${q3(entry.qty)},
				${entry.dish.servingUnit}::serving_unit, ${entry.storage}::storage_method,
				${ts(entry.preparedAt)}, ${ts(entry.safeUntil)},
				${entry.pending ? "pending_disposition" : "closed"}::leftover_status,
				${ts(entry.decidedAt)}
			)`,
		)

		const dispositionValues = planned
			.filter((entry) => !entry.pending)
			.map(
				(entry) => sql`(
					${context.tenantId}, ${entry.id}, ${q3(entry.retainQty)}, ${q3(entry.sellQty)},
					${q3(entry.donateQty)}, ${q3(entry.wasteQty)},
					${q2(entry.dish.sellingPrice * B2B_DISCOUNT)}, ${q3(entry.suggestion[0])},
					${context.ownerUserId}, ${ts(entry.decidedAt)}
				)`,
			)

		const predictionValues = planned.map(
			(entry) => sql`(
				${context.tenantId}, ${context.restaurantId}, 'reuse', ${entry.id},
				${JSON.stringify({
					suggestedRetainQty: entry.suggestion[0],
					suggestedSellQty: entry.suggestion[1],
					suggestedDonateQty: entry.suggestion[2],
					suggestedWasteQty: entry.suggestion[3],
					unit: entry.dish.servingUnit,
					basis: entry.basis,
				})}::jsonb,
				'seed', 'v1', 'seed', ${ts(entry.decidedAt.subtract(6, "minute"))}
			)`,
		)

		const reuseConfirmationValues: SQL[] = planned
			.filter((entry) => !entry.pending && entry.retainQty > 0)
			.flatMap((entry) => {
				const confirmedQty = round3(entry.retainQty * (0.6 + 0.4 * rng()))
				if (confirmedQty <= 0) return []
				return [
					sql`(
						${context.tenantId}, ${entry.id}, ${q3(confirmedQty)},
						${context.ownerUserId},
						${`Reused in ${entry.dish.reuseRoute} next-day service`},
						${ts(entry.decidedAt.add(8, "hour"))}
					)`,
				]
			})

		const listingValues: SQL[] = []
		const itemValues: SQL[] = []
		const eventValues: SQL[] = []
		const tally: Record<string, number> = {}

		for (const bucket of allBuckets) {
			const outcome = outcomes.get(bucket.key) ?? "expired"
			tally[outcome] = (tally[outcome] ?? 0) + 1

			const listingId = nextUuid(rng)
			const escalated = bucket.channel === "b2b" && outcome !== "sold"
			const channel = escalated ? "ngo" : bucket.channel
			const askingPrice = bucket.channel === "b2b" ? bucket.priceWeight / bucket.qty : 0
			const price = escalated ? 0 : askingPrice
			const pickupFrom = bucket.createdAt.add(20, "minute")
			const pickupUntil = bucket.safeUntil.subtract(30, "minute")
			const escalateAt =
				bucket.channel === "b2b" ? bucket.safeUntil.subtract(NGO_BUFFER_HOURS, "hour") : null
			const claimant = channel === "b2b" ? context.buyerTenantId : context.ngoTenantId
			const claimantName = channel === "b2b" ? "Anna Tiffin" : "Akshaya Trust"

			const claimedAt = escalated
				? bucket.safeUntil
						.subtract(NGO_BUFFER_HOURS, "hour")
						.add(6 + Math.floor(rng() * 20), "minute")
				: bucket.createdAt.add(22 + Math.floor(rng() * 48), "minute")
			const completedAt = claimedAt.add(38 + Math.floor(rng() * 55), "minute")
			const settled =
				outcome === "sold" || outcome === "escalated_claimed" || outcome === "claimed_direct"
			const claimHeld = settled || outcome === "no_show"

			listingValues.push(sql`(
				${listingId}, ${context.tenantId}, ${context.restaurantId}, ${channel}::listing_channel,
				${settled ? "completed" : "expired"}::listing_status, ${q3(bucket.qty)},
				${bucket.unit}::serving_unit, ${q2(price)}, ${ts(pickupFrom)}, ${ts(pickupUntil)},
				${ts(bucket.safeUntil)}, ${escalateAt == null ? null : ts(escalateAt)},
				${claimHeld ? claimant : null}, ${claimHeld ? ts(claimedAt) : null},
				${settled ? ts(completedAt) : null}, ${ts(bucket.createdAt)},
				(select latitude from restaurants where id = ${context.restaurantId}),
				(select longitude from restaurants where id = ${context.restaurantId})
			)`)

			for (const item of bucket.items) {
				itemValues.push(sql`(
					${context.tenantId}, ${listingId}, ${item.leftoverId}, ${q3(item.qty)}
				)`)
			}

			const audience = bucket.channel === "b2b" ? "nearby restaurants" : "partner NGOs"
			const listed =
				bucket.channel === "b2b"
					? `listed ${q3(bucket.qty)} ${bucket.unit} at ₹${q2(askingPrice)} per ${bucket.unit}`
					: `listed ${q3(bucket.qty)} ${bucket.unit} for collection`
			eventValues.push(sql`(
				${context.tenantId}, ${listingId}, 'created', ${listed}, ${ts(bucket.createdAt)}
			)`)
			eventValues.push(sql`(
				${context.tenantId}, ${listingId}, 'notified',
				${`${3 + Math.floor(rng() * 5)} ${audience} notified`},
				${ts(bucket.createdAt.add(2, "minute"))}
			)`)
			if (escalated && escalateAt != null) {
				eventValues.push(sql`(
					${context.tenantId}, ${listingId}, 'escalated',
					'no takers on the B2B channel; moved to the NGO channel at no charge',
					${ts(escalateAt)}
				)`)
			}
			if (claimHeld) {
				eventValues.push(sql`(
					${context.tenantId}, ${listingId}, 'claimed', ${`claimed by ${claimantName}`},
					${ts(claimedAt)}
				)`)
			}
			if (settled) {
				eventValues.push(sql`(
					${context.tenantId}, ${listingId}, 'collected',
					${`${q3(bucket.qty)} ${bucket.unit} collected in full`}, ${ts(completedAt)}
				)`)
			} else {
				if (outcome === "no_show") {
					eventValues.push(sql`(
						${context.tenantId}, ${listingId}, 'no_show',
						${`${claimantName} did not collect before the pickup window closed`},
						${ts(pickupUntil)}
					)`)
				}
				eventValues.push(sql`(
					${context.tenantId}, ${listingId}, 'expired',
					'passed safe-until unclaimed; quantity written off', ${ts(bucket.safeUntil)}
				)`)
			}
		}

		await writeChunks(
			tx,
			lotValues,
			(values) => sql`
				insert into inventory_lots
					(id, tenant_id, restaurant_id, ingredient_id, qty_purchased_base, qty_remaining_base,
					 unit_cost, purchase_date, expiry_date, created_at)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			movementValues,
			(values) => sql`
				insert into inventory_movements
					(tenant_id, restaurant_id, lot_id, ingredient_id, qty_delta_base, reason, occurred_at)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			prepValues,
			(values) => sql`
				insert into prep_entries
					(id, tenant_id, restaurant_id, dish_id, service_date, meal_period, qty_prepared,
					 qty_served, covers, prepared_at)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			leftoverValues,
			(values) => sql`
				insert into leftovers
					(id, tenant_id, restaurant_id, dish_id, prep_entry_id, service_date, qty, unit,
					 storage, prepared_at, safe_until, status, created_at)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			dispositionValues,
			(values) => sql`
				insert into leftover_dispositions
					(tenant_id, leftover_id, retain_qty, sell_qty, donate_qty, waste_qty,
					 sell_price_per_unit, ai_suggested_retain_qty, decided_by_user_id, decided_at)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			predictionValues,
			(values) => sql`
				insert into predictions
					(tenant_id, restaurant_id, kind, target_ref, payload, model, prompt_version,
					 source, created_at)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			listingValues,
			(values) => sql`
				insert into surplus_listings
					(id, tenant_id, restaurant_id, channel, status, qty, unit, price_per_unit,
					 pickup_from, pickup_until, safe_until, escalate_at, claimed_by_tenant_id,
					 claimed_at, completed_at, created_at, latitude, longitude)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			itemValues,
			(values) => sql`
				insert into listing_items (tenant_id, listing_id, leftover_id, qty)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			eventValues,
			(values) => sql`
				insert into listing_events (tenant_id, listing_id, event, detail, occurred_at)
				values ${values}
			`,
		)
		await writeChunks(
			tx,
			reuseConfirmationValues,
			(values) => sql`
				insert into reuse_confirmations
					(tenant_id, leftover_id, confirmed_reused_qty, confirmed_by_user_id, notes, confirmed_at)
				values ${values}
			`,
		)

		return {
			days: WINDOW_DAYS,
			lots: lotValues.length,
			movements: movementValues.length,
			prepEntries: prepValues.length,
			leftovers: leftoverValues.length,
			dispositions: dispositionValues.length,
			predictions: predictionValues.length,
			reuseConfirmations: reuseConfirmationValues.length,
			listings: listingValues.length,
			outcomes: tally,
		}
	})
}
