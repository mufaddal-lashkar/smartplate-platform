import { describe, expect, test } from "bun:test"
import { login, registerTenant, rotateRefresh } from "../src/modules/auth/auth.service"
import { fixedClock } from "../src/shared/clock"
import { hasPermission } from "../src/shared/rbac"

const clock = fixedClock("2026-08-01T10:00:00Z")

const uniqueEmail = () => `owner-${crypto.randomUUID().slice(0, 8)}@test.local`

describe("auth", () => {
	test("register creates a tenant, profile and owner user", async () => {
		const result = await registerTenant(
			{
				tenantType: "restaurant",
				tenantName: "Spice Route",
				name: "Asha",
				email: uniqueEmail(),
				password: "correct-horse-battery",
			},
			clock,
		)

		expect(result.session.tenantType).toBe("restaurant")
		expect(result.session.role).toBe("owner")
		expect(result.accessToken.split(".")).toHaveLength(3)
		expect(result.refreshToken.length).toBeGreaterThan(20)
	})

	test("an ngo registration gets the ngo_admin role", async () => {
		const result = await registerTenant(
			{
				tenantType: "ngo",
				tenantName: "Akshaya Trust",
				name: "Ravi",
				email: uniqueEmail(),
				password: "another-good-password",
			},
			clock,
		)

		expect(result.session.tenantType).toBe("ngo")
		expect(result.session.role).toBe("ngo_admin")
	})

	test("login rejects a wrong password", async () => {
		const email = uniqueEmail()
		await registerTenant(
			{
				tenantType: "restaurant",
				tenantName: "Anna Tiffin",
				name: "Meera",
				email,
				password: "right-password",
			},
			clock,
		)

		await expect(login({ email, password: "wrong-password" }, clock)).rejects.toThrow()
	})

	test("login succeeds with the right password", async () => {
		const email = uniqueEmail()
		await registerTenant(
			{
				tenantType: "restaurant",
				tenantName: "Green Bowl",
				name: "Dev",
				email,
				password: "right-password",
			},
			clock,
		)

		const result = await login({ email, password: "right-password" }, clock)
		expect(result.session.role).toBe("owner")
	})

	test("refresh rotates the token and rejects the replayed one", async () => {
		const first = await registerTenant(
			{
				tenantType: "restaurant",
				tenantName: "Rotation Test",
				name: "Sam",
				email: uniqueEmail(),
				password: "rotation-password",
			},
			clock,
		)

		const second = await rotateRefresh(first.refreshToken, clock)
		expect(second.refreshToken).not.toBe(first.refreshToken)

		await expect(rotateRefresh(first.refreshToken, clock)).rejects.toThrow()
	})

	test("duplicate email registration is rejected", async () => {
		const email = uniqueEmail()
		const input = {
			tenantType: "restaurant" as const,
			tenantName: "Dup",
			name: "Dup",
			email,
			password: "duplicate-password",
		}

		await registerTenant(input, clock)
		await expect(registerTenant(input, clock)).rejects.toThrow()
	})
})

describe("rbac matrix", () => {
	test("staff may write inventory but not decide dispositions", () => {
		expect(hasPermission("staff", "inventory.write")).toBe(true)
		expect(hasPermission("staff", "disposition.decide")).toBe(false)
	})

	test("owner may decide dispositions and price listings", () => {
		expect(hasPermission("owner", "disposition.decide")).toBe(true)
		expect(hasPermission("owner", "listing.price")).toBe(true)
	})

	test("ngo volunteer may only complete pickups", () => {
		expect(hasPermission("ngo_volunteer", "listing.complete")).toBe(true)
		expect(hasPermission("ngo_volunteer", "inventory.write")).toBe(false)
		expect(hasPermission("ngo_volunteer", "listing.claim")).toBe(false)
	})

	test("super admin cannot price or claim another tenant's food", () => {
		expect(hasPermission("super_admin", "listing.price")).toBe(false)
		expect(hasPermission("super_admin", "disposition.decide")).toBe(false)
		expect(hasPermission("super_admin", "platform.analytics")).toBe(true)
	})
})
