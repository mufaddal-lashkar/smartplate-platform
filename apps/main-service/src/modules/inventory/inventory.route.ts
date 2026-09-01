import type { Collection } from "@smartplate/contracts/envelope"
import { Elysia, t } from "elysia"
import type { InventoryLot, InventoryMovement } from "../../db/schema"
import { systemClock } from "../../shared/clock"
import { readIdempotent, requireIdempotencyKey, writeIdempotent } from "../../shared/idempotency"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import type { ExpiringLot, StockAggregate } from "./inventory.queries"
import { adjustmentInputSchema, purchaseInputSchema } from "./inventory.schema"
import {
	getExpiring,
	getLots,
	getMovements,
	getStock,
	recordAdjustment,
	recordPurchase,
} from "./inventory.service"

type PurchaseResponse = { lot: InventoryLot }
type IdempotencyEnvelope<T> = { idempotent: false; data: T } | { idempotent: true; data: T }

const wrapIdempotent = <T>(response: T, hit: boolean): IdempotencyEnvelope<T> =>
	hit ? { idempotent: true, data: response } : { idempotent: false, data: response }

export const inventoryRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/inventory/stock", async ({ session }): Promise<Collection<StockAggregate>> => {
		const active = requireSession(session)
		requirePermission(active, "inventory.read")
		return { items: await getStock(active), nextCursor: "" }
	})
	.get(
		"/v1/inventory/lots",
		async ({ query, session }): Promise<Collection<InventoryLot>> => {
			const active = requireSession(session)
			requirePermission(active, "inventory.read")
			const ingredientId = query.ingredientId ?? ""
			return { items: await getLots(active, ingredientId), nextCursor: "" }
		},
		{
			query: t.Object({
				ingredientId: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/v1/inventory/expiring",
		async ({ query, session }): Promise<Collection<ExpiringLot>> => {
			const active = requireSession(session)
			requirePermission(active, "inventory.read")
			const withinDays = query.withinDays ?? 7
			return { items: await getExpiring(active, withinDays), nextCursor: "" }
		},
		{
			query: t.Object({
				withinDays: t.Optional(t.Integer({ minimum: 1, maximum: 90 })),
			}),
		},
	)
	.get(
		"/v1/inventory/movements",
		async ({ query, session }): Promise<Collection<InventoryMovement>> => {
			const active = requireSession(session)
			requirePermission(active, "inventory.read")
			const ids = (query.ingredientIds ?? "")
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s !== "")
			return { items: await getMovements(active, ids), nextCursor: "" }
		},
		{
			query: t.Object({
				ingredientIds: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/v1/inventory/purchases",
		async ({ body, request, session }): Promise<IdempotencyEnvelope<PurchaseResponse>> => {
			const active = requireSession(session)
			requirePermission(active, "inventory.write")
			const key = requireIdempotencyKey({ request })
			const input = purchaseInputSchema.parse(body)

			const cached = await readIdempotent<PurchaseResponse>(active.tenantId, key, input)
			if (cached != null) return wrapIdempotent(cached, true)

			const response = await recordPurchase(active, input, systemClock.now().toDate())
			await writeIdempotent(active.tenantId, key, input, response)
			return wrapIdempotent(response, false)
		},
	)
	.post("/v1/inventory/adjustments", async ({ body, session }) => {
		const active = requireSession(session)
		requirePermission(active, "inventory.write")
		return recordAdjustment(active, adjustmentInputSchema.parse(body), systemClock.now().toDate())
	})
