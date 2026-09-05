import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Elysia } from "elysia"
import { catalogRoute } from "../src/modules/catalog/catalog.route"
import { envelopePlugin } from "../src/shared/envelope.plugin"
import { isReadOnlyPath } from "../src/shared/rbac"
import { makeRestaurantTenant } from "./helpers/fixtures"

process.env.JWT_SECRET = "test-jwt-secret"
process.env.SERVICE_TOKEN = "full-token"
process.env.SERVICE_READ_TOKEN = "read-token"

const buildApp = (): Elysia => new Elysia().use(envelopePlugin).use(catalogRoute)

const TEST_PORT = 13579
let server: ReturnType<ReturnType<typeof buildApp>["listen"]>

beforeAll(() => {
	server = buildApp().listen(TEST_PORT)
})

afterAll(() => {
	server.stop()
})

describe("isReadOnlyPath", () => {
	it("matches the six whitelisted paths", () => {
		expect(isReadOnlyPath("/v1/dishes")).toBe(true)
		expect(isReadOnlyPath("/v1/ingredients")).toBe(true)
		expect(isReadOnlyPath("/v1/leftovers")).toBe(true)
		expect(isReadOnlyPath("/v1/leftovers/")).toBe(true)
		expect(isReadOnlyPath("/v1/listings")).toBe(true)
		expect(isReadOnlyPath("/v1/sessions")).toBe(true)
		expect(isReadOnlyPath("/v1/sessions/")).toBe(true)
		expect(isReadOnlyPath("/v1/inventory/stock")).toBe(true)
	})

	it("rejects every non-whitelisted path", () => {
		expect(isReadOnlyPath("/v1/users")).toBe(false)
		expect(isReadOnlyPath("/v1/inventory/purchases")).toBe(false)
		expect(isReadOnlyPath("/v1/leftovers/dispositions")).toBe(false)
		expect(isReadOnlyPath("/v1/bot/bind")).toBe(false)
	})

	it("strips query strings and trailing slashes", () => {
		expect(isReadOnlyPath("/v1/dishes?search=bir")).toBe(true)
		expect(isReadOnlyPath("/v1/leftovers/?serviceDate=today")).toBe(true)
	})
})

describe("read token guard", () => {
	it("accepts the read token on a read path with the tenant header", async () => {
		const ctx = await makeRestaurantTenant()
		const res = await fetch(`http://localhost:${TEST_PORT}/v1/dishes`, {
			method: "GET",
			headers: {
				"x-service-token": process.env.SERVICE_READ_TOKEN ?? "",
				"x-tenant-id": ctx.tenantId,
				"x-user-id": ctx.userId,
			},
		})
		if (!res.ok) {
			console.error("unexpected status", res.status, await res.text())
		}
		expect(res.status).toBe(200)
		const body = (await res.json()) as { data?: { items?: Array<unknown> } }
		expect(Array.isArray(body.data?.items)).toBe(true)
	})

	it("rejects the read token without x-tenant-id on a read path", async () => {
		const res = await fetch(`http://localhost:${TEST_PORT}/v1/dishes`, {
			method: "GET",
			headers: {
				"x-service-token": process.env.SERVICE_READ_TOKEN ?? "",
			},
		})
		expect(res.status).toBe(403)
	})

	it("rejects the read token on a destructive POST", async () => {
		const ctx = await makeRestaurantTenant()
		const res = await fetch(`http://localhost:${TEST_PORT}/v1/dishes`, {
			method: "POST",
			headers: {
				"x-service-token": process.env.SERVICE_READ_TOKEN ?? "",
				"x-tenant-id": ctx.tenantId,
				"x-user-id": ctx.userId,
				"content-type": "application/json",
			},
			body: JSON.stringify({ name: "Should fail", category: "main", servingUnit: "plate" }),
		})
		expect([403, 422]).toContain(res.status)
	})
})
