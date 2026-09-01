import { Elysia } from "elysia"
import { verifySignedPath } from "./reports.service"

const contentTypeFor = (filename: string): string => {
	if (filename.endsWith(".pdf")) return "application/pdf"
	if (filename.endsWith(".csv")) return "text/csv; charset=utf-8"
	if (filename.endsWith(".xlsx"))
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	return "application/octet-stream"
}

export const reportsDlRoute = new Elysia({ prefix: "/api" }).get(
	"/reports/dl",
	async ({ query, set }) => {
		const path = String(query.path ?? "")
		const exp = String(query.exp ?? "")
		const sig = String(query.sig ?? "")
		const result = verifySignedPath(path, exp, sig)
		if (!result.ok) {
			set.status = 404
			return { error: result.reason }
		}
		const file = Bun.file(result.absolutePath)
		if (!(await file.exists())) {
			set.status = 404
			return { error: "missing" }
		}
		const headers: Record<string, string> = {
			"content-type": contentTypeFor(result.filename),
			"content-disposition": `attachment; filename="${result.filename}"`,
			"cache-control": "no-store",
		}
		return new Response(file, { headers })
	},
)
