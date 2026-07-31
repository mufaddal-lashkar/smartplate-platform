import { statusForCode } from "@smartplate/contracts/error-codes"
import { Elysia } from "elysia"
import { ApiError } from "./api-error"

export const envelopePlugin = new Elysia({ name: "envelope" })
	.derive({ as: "global" }, ({ request }) => ({
		requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
	}))
	.mapResponse({ as: "global" }, ({ response, requestId, set }) => {
		if (response instanceof Response) return response

		const status = Number(set.status ?? 200)
		return Response.json(
			{ success: true, data: response, meta: { requestId, nextCursor: "" } },
			{ status, headers: { "x-request-id": requestId } },
		)
	})
	.onError({ as: "global" }, ({ error, requestId, set }) => {
		const known = error instanceof ApiError
		const status = known ? statusForCode(error.code) : 500

		set.status = status

		return Response.json(
			{
				success: false,
				error: {
					code: known ? error.code : "INTERNAL",
					message: known ? error.message : "Something went wrong on our end.",
					details: known ? error.details : [],
				},
				meta: { requestId, nextCursor: "" },
			},
			{ status, headers: { "x-request-id": requestId } },
		)
	})
