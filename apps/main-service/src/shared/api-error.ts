import type { ApiErrorDetail } from "@smartplate/contracts/envelope"
import type { ErrorCode } from "@smartplate/contracts/error-codes"

export class ApiError extends Error {
	readonly code: ErrorCode
	readonly details: ApiErrorDetail[]

	constructor(code: ErrorCode, message: string, details: ApiErrorDetail[] = []) {
		super(message)
		this.name = "ApiError"
		this.code = code
		this.details = details
	}
}
