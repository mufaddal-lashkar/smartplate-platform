import { statusForCode } from "@smartplate/contracts/error-codes"
import { Elysia } from "elysia"
import { ZodError } from "zod"
import { ApiError } from "./api-error"

const toApiError = (error: Error): ApiError => {
	if (error instanceof ApiError) return error

	if (error instanceof ZodError) {
		return new ApiError(
			"VALIDATION_FAILED",
			"Some fields need attention.",
			error.issues.map((issue) => ({
				field: issue.path.join("."),
				code: issue.code,
				message: issue.message,
			})),
		)
	}

	console.error("[unhandled]", error)
	return new ApiError("INTERNAL", "Something went wrong on our end.")
}

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
		const apiError = toApiError(error)
		const status = statusForCode(apiError.code)

		set.status = status

		return Response.json(
			{
				success: false,
				error: { code: apiError.code, message: apiError.message, details: apiError.details },
				meta: { requestId, nextCursor: "" },
			},
			{ status, headers: { "x-request-id": requestId } },
		)
	})
