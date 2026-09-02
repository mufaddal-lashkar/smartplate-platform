import { Elysia } from "elysia"
import { ApiError } from "../../shared/api-error"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { findActiveSessionsForUser, revokeFamily } from "./auth.service"

export const sessionsRoute = new Elysia({ prefix: "/v1/sessions" })
	.use(sessionPlugin)
	.get("/", async ({ session }) => {
		const active = requireSession(session)
		const list = await findActiveSessionsForUser(active.userId)
		return { sessions: list }
	})
	.delete("/:family", async ({ session, params }) => {
		const active = requireSession(session)
		if (params.family === "") {
			throw new ApiError("VALIDATION_ERROR", "family is required", [
				{ field: "family", message: "family is required" },
			])
		}
		const list = await findActiveSessionsForUser(active.userId)
		const target = list.find((s) => s.family === params.family)
		if (target == null) {
			throw new ApiError("RESOURCE_NOT_FOUND", "Session not found.")
		}
		await revokeFamily(params.family)
		return { ok: true }
	})
