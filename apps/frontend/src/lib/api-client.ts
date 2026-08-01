import type { ApiErrorDetail, ApiResponse } from "@smartplate/contracts/envelope"
import type { ErrorCode } from "@smartplate/contracts/error-codes"

export class ApiClientError extends Error {
	readonly code: ErrorCode
	readonly details: ApiErrorDetail[]

	constructor(code: ErrorCode, message: string, details: ApiErrorDetail[]) {
		super(message)
		this.name = "ApiClientError"
		this.code = code
		this.details = details
	}
}

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
	const response = await fetch(`/api${path}`, {
		...init,
		credentials: "include",
		headers: { "content-type": "application/json", ...init.headers },
	})

	const body: ApiResponse<T> = await response.json()

	if (!body.success) {
		throw new ApiClientError(body.error.code, body.error.message, body.error.details)
	}

	return body.data
}

export const apiGet = <T>(path: string): Promise<T> => request<T>(path, { method: "GET" })

export const apiPost = <T>(path: string, payload: object = {}): Promise<T> =>
	request<T>(path, { method: "POST", body: JSON.stringify(payload) })

export const fieldError = (error: Error | null, field: string): string => {
	if (!(error instanceof ApiClientError)) return ""
	return error.details.find((detail) => detail.field === field)?.message ?? ""
}
