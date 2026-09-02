import type { Elysia } from "elysia"
import { ApiError } from "../../shared/api-error"

const serviceToken = (): string => process.env.SERVICE_TOKEN ?? "dev-service-token"

export const requireServiceToken = (app: Elysia): Elysia =>
	app.derive({ as: "scoped" }, ({ request }) => {
		const header = request.headers.get("x-service-token") ?? ""
		if (header === "" || header !== serviceToken()) {
			throw new ApiError("AUTH_FORBIDDEN", "This endpoint is only callable by the bot service.")
		}
		return { isBot: true }
	})
