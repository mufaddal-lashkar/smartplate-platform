import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve as resolvePath } from "node:path"
import { sql } from "drizzle-orm"
import { withSystem, withTenant } from "../src/db/tx"
import { renderCsv } from "../src/modules/reports/renderers/csv"
import { renderPdf } from "../src/modules/reports/renderers/pdf"
import { renderXlsx } from "../src/modules/reports/renderers/xlsx"
import {
	enqueueReport,
	REPORTS_DIR,
	renderReport,
	signDownloadUrl,
	URL_TTL_SECONDS,
	verifySignedPath,
} from "../src/modules/reports/reports.service"
import { ApiError } from "../src/shared/api-error"
import { makeRestaurantTenant, seedKnownDay } from "./helpers/fixtures"

const DAY = "2026-08-01"
const RANGE = { from: "2026-08-01", to: "2026-08-07" }

const cleanReports = async () => {
	await withSystem(async (tx) => {
		await tx.execute(sql`delete from reports`)
	})
	try {
		rmSync(REPORTS_DIR, { recursive: true, force: true })
	} catch {}
	mkdirSync(REPORTS_DIR, { recursive: true })
}

const expectApiError = async (fn: () => Promise<unknown>, code?: string): Promise<ApiError> => {
	try {
		await fn()
	} catch (e) {
		expect(e).toBeInstanceOf(ApiError)
		if (code) expect((e as ApiError).code).toBe(code)
		return e as ApiError
	}
	throw new Error("expected function to throw")
}

const reportType = (record: { reportType: string }): string => record.reportType

describe("reports — schema + queries", () => {
	beforeAll(async () => {
		await cleanReports()
	})

	afterAll(async () => {
		await cleanReports()
	})

	test("enqueueReport inserts a queued row with the correct fields", async () => {
		const ctx = await makeRestaurantTenant()

		const record = await enqueueReport(ctx, ctx.restaurantId, {
			reportType: "waste",
			from: RANGE.from,
			to: RANGE.to,
			format: "csv",
		})

		expect(record.status).toBe("queued")
		expect(reportType(record)).toBe("waste")
		expect(record.format).toBe("csv")
		expect(record.tenantId).toBe(ctx.tenantId)
		expect(record.restaurantId).toBe(ctx.restaurantId)
		expect(record.artifactPath).toBe("")
	})

	test("renderReport writes a CSV file and marks the row succeeded", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: DAY,
			prepared: 50,
			leftover: 10,
			reused: 4,
			sold: 0,
			donated: 4,
			binned: 2,
		})

		const record = await enqueueReport(ctx, ctx.restaurantId, {
			reportType: "waste",
			from: RANGE.from,
			to: RANGE.to,
			format: "csv",
		})
		const rendered = await renderReport(record)

		expect(rendered).not.toBeNull()
		expect(rendered?.status).toBe("succeeded")
		expect(rendered?.finishedAt).not.toBe("")

		const filePath = resolvePath(rendered?.artifactPath)
		expect(existsSync(filePath)).toBe(true)
		const content = readFileSync(filePath, "utf-8")
		expect(content).toContain("Waste (kg)")
		expect(content).toContain(DAY)
	})

	test("renderReport also writes PDF and XLSX artifacts", async () => {
		const ctx = await makeRestaurantTenant()
		await seedKnownDay(ctx, {
			serviceDate: DAY,
			prepared: 30,
			leftover: 6,
			reused: 3,
			sold: 0,
			donated: 2,
			binned: 1,
		})

		for (const format of ["pdf", "xlsx"] as const) {
			const record = await enqueueReport(ctx, ctx.restaurantId, {
				reportType: "dishes",
				from: RANGE.from,
				to: RANGE.to,
				format,
			})
			const rendered = await renderReport(record)
			expect(rendered?.status).toBe("succeeded")
			expect(existsSync(rendered?.artifactPath)).toBe(true)
		}
	})
})

describe("reports — signed URL verifier", () => {
	beforeAll(async () => {
		await cleanReports()
	})

	afterAll(async () => {
		await cleanReports()
	})

	const makeReport = async () => {
		const ctx = await makeRestaurantTenant()
		const record = await enqueueReport(ctx, ctx.restaurantId, {
			reportType: "waste",
			from: RANGE.from,
			to: RANGE.to,
			format: "csv",
		})
		return { ctx, record }
	}

	test("valid signature + unexpired timestamp verifies and resolves to a real file", async () => {
		const { record } = await makeReport()
		const filePath = join(REPORTS_DIR, record.tenantId, `${record.id}.csv`)
		mkdirSync(join(REPORTS_DIR, record.tenantId), { recursive: true })
		writeFileSync(filePath, "hello\n")

		const url = signDownloadUrl(record, "http://localhost:3001")
		const parsed = new URL(url)
		const path = parsed.searchParams.get("path") ?? ""
		const exp = parsed.searchParams.get("exp") ?? ""
		const sig = parsed.searchParams.get("sig") ?? ""

		const result = verifySignedPath(path, exp, sig)
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect(result.absolutePath).toBe(filePath)
			expect(result.filename).toBe(`${record.id}.csv`)
		}
	})

	test("expired timestamp is rejected with reason=expired", async () => {
		const { record } = await makeReport()
		const path = `${record.tenantId}/${record.id}.csv`
		const past = Math.floor(Date.now() / 1000) - 10
		const { createHmac } = await import("node:crypto")
		const sig = createHmac("sha256", process.env.REPORTS_SIGNING_SECRET ?? "dev-reports-secret")
			.update(`${path}|${past}`)
			.digest("hex")

		const result = verifySignedPath(path, String(past), sig)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe("expired")
	})

	test("bad signature is rejected with reason=bad-signature", async () => {
		const { record } = await makeReport()
		const path = `${record.tenantId}/${record.id}.csv`
		const exp = String(Math.floor(Date.now() / 1000) + URL_TTL_SECONDS)

		const result = verifySignedPath(path, exp, "0".repeat(64))
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe("bad-signature")
	})

	test("path traversal with ../ is rejected with reason=bad-path", async () => {
		const path = "../etc/passwd"
		const exp = String(Math.floor(Date.now() / 1000) + URL_TTL_SECONDS)
		const { createHmac } = await import("node:crypto")
		const sig = createHmac("sha256", process.env.REPORTS_SIGNING_SECRET ?? "dev-reports-secret")
			.update(`${path}|${exp}`)
			.digest("hex")

		const result = verifySignedPath(path, exp, sig)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe("bad-path")
	})

	test("empty path is rejected with reason=missing", () => {
		const result = verifySignedPath("", "1", "0".repeat(64))
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe("missing")
	})
})

describe("reports — RLS isolation", () => {
	beforeAll(async () => {
		await cleanReports()
	})

	afterAll(async () => {
		await cleanReports()
	})

	test("tenant A cannot fetch tenant B's report", async () => {
		const ctxA = await makeRestaurantTenant()
		const ctxB = await makeRestaurantTenant()

		const record = await enqueueReport(ctxA, ctxA.restaurantId, {
			reportType: "waste",
			from: RANGE.from,
			to: RANGE.to,
			format: "csv",
		})

		const seen = await withTenant(ctxB, async (tx) => {
			const rows = await tx.execute(sql`select id from reports where id = ${record.id}`)
			return rows.length
		})
		expect(seen).toBe(0)
	})

	test("downloading another tenant's report returns 404, not 403", async () => {
		const ctxA = await makeRestaurantTenant()
		const ctxB = await makeRestaurantTenant()

		const record = await enqueueReport(ctxA, ctxA.restaurantId, {
			reportType: "waste",
			from: RANGE.from,
			to: RANGE.to,
			format: "csv",
		})
		await renderReport(record)

		const { downloadReportForSession } = await import("../src/modules/reports/reports.service")
		await expectApiError(() => downloadReportForSession(ctxB, record.id), "RESOURCE_NOT_FOUND")
	})
})

describe("reports — renderers", () => {
	test("renderCsv produces a valid header row with all expected columns", () => {
		const out = renderCsv({
			title: "Test",
			headers: ["A", "B"],
			rows: [
				["1", "2"],
				["3", "4"],
			],
		})
		const text = new TextDecoder().decode(out)
		expect(text).toContain("A,B")
		expect(text).toContain("1,2")
		expect(text).toContain("3,4")
	})

	test("renderCsv escapes commas, quotes, and newlines", () => {
		const out = renderCsv({
			title: "Test",
			headers: ["x"],
			rows: [['a,b"c\nd']],
		})
		const text = new TextDecoder().decode(out)
		expect(text).toContain('"a,b""c\nd"')
	})

	test("renderPdf produces a non-empty PDF byte stream starting with %PDF-", async () => {
		const out = await renderPdf("Title", {
			title: "T",
			headers: ["a", "b"],
			rows: [["1", "2"]],
		})
		expect(out.byteLength).toBeGreaterThan(100)
		const head = new TextDecoder().decode(out.slice(0, 5))
		expect(head).toBe("%PDF-")
	})

	test("renderXlsx produces a non-empty XLSX byte stream (ZIP magic PK)", async () => {
		const out = await renderXlsx("Sheet1", {
			title: "T",
			headers: ["a", "b"],
			rows: [["1", "2"]],
		})
		expect(out.byteLength).toBeGreaterThan(1000)
		expect(out[0]).toBe(0x50)
		expect(out[1]).toBe(0x4b)
	})
})
