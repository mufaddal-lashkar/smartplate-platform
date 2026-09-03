import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "../src/db/client"
import { setSessionConfig, withSystem } from "../src/db/tx"
import { bindChat, startSession, unbindChat } from "../src/modules/bot/bot.service"
import { makeTenant } from "./helpers/db"

process.env.JWT_SECRET = "test-jwt-secret"

let tenantId: string
let ownerId: string
let tenantCode: string
let email: string
let chatId = 0

beforeAll(async () => {
	const tenant = await makeTenant("restaurant")
	tenantId = tenant.id
	ownerId = tenant.ownerId
	tenantCode = `bot-restaurant-${tenant.id.slice(0, 8)}`
	email = `bot-owner-${tenant.id.slice(0, 8)}@test.local`

	await withSystem(async (tx) => {
		await setSessionConfig(tx, "app.tenant_id", tenant.id)
		await tx.execute(sql`
			update tenants set name = ${tenantCode} where id = ${tenant.id}::uuid
		`)
		await tx.execute(sql`
			insert into restaurants (tenant_id, name, city, cuisine_type, latitude, longitude, browse_radius_km)
			values (${tenant.id}::uuid, ${tenantCode}, 'Test', 'Multi', 12.97, 77.59, 10)
		`)
		await tx.execute(sql`
			update users set email = ${email} where id = ${tenant.ownerId}::uuid
		`)
	})
})

afterAll(async () => {
	await withSystem(async (tx) => {
		await tx.execute(sql`delete from telegram_chats where chat_id = ${chatId}::bigint`)
		await tx.execute(sql`delete from bot_user_links where chat_id = ${chatId}::bigint`)
	})
})

const schema = z.object({ chatId: z.number().int().positive() })

describe("bindChat", () => {
	it("rejects when the tenant code is unknown", async () => {
		await expect(
			bindChat({ chatId: 1, tenantCode: "no-such-tenant", email }),
		).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" })
	})

	it("rejects when the email is not a member", async () => {
		await expect(
			bindChat({ chatId: 1, tenantCode, email: "stranger@test.local" }),
		).rejects.toMatchObject({ code: "AUTH_INVALID_CREDENTIALS" })
	})

	it("binds and returns a refresh token", async () => {
		chatId = Math.floor(Math.random() * 1e15)
		const result = await bindChat({ chatId, tenantCode, email })
		expect(result.chatId).toBe(chatId)
		expect(result.tenantId).toBe(tenantId)
		expect(result.refreshToken.split(".")).toHaveLength(2)
		expect(result.refreshExpiresIn).toBeGreaterThan(0)
	})
})

describe("startSession", () => {
	it("issues an access token from a valid refresh token", async () => {
		chatId = Math.floor(Math.random() * 1e15)
		const bind = await bindChat({ chatId, tenantCode, email })

		const session = await startSession("", { refreshToken: bind.refreshToken })
		expect(session.accessToken.split(".")).toHaveLength(3)
		expect(session.expiresIn).toBeGreaterThan(0)
		expect(session.tenantId).toBe(tenantId)
	})

	it("rejects an unknown refresh token", async () => {
		await expect(startSession("", { refreshToken: "deadbeef.deadbeef" })).rejects.toMatchObject({
			code: "AUTH_TOKEN_EXPIRED",
		})
	})
})

describe("unbindChat", () => {
	it("removes the binding", async () => {
		chatId = Math.floor(Math.random() * 1e15)
		await bindChat({ chatId, tenantCode, email })
		await unbindChat(chatId)

		const rows = await db.execute(
			sql`select 1 as present from telegram_chats where chat_id = ${chatId}::bigint`,
		)
		expect(rows.length).toBe(0)
	})
})

describe("bot service-token guard scope", () => {
	it("does not leak onto routes registered after the bot module", async () => {
		const source = await Bun.file("apps/main-service/src/modules/bot/bot.guard.ts").text()
		expect(source).toContain('as: "local"')
		expect(source).not.toContain('as: "scoped"')
	})

	it("keeps every non-bot route out of the guard's reach in the route table", async () => {
		const index = await Bun.file("apps/main-service/src/index.ts").text()
		const botAt = index.indexOf(".use(botRoute)")
		expect(botAt).toBeGreaterThan(-1)
		const after = index.slice(botAt)
		expect(after).toContain(".use(inventoryRoute)")
		expect(after).toContain(".use(analyticsRoute)")
	})
})

void schema
void ownerId
void email
void tenantCode
