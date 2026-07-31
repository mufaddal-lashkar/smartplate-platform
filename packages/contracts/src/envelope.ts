import type { ErrorCode } from "./error-codes"

export type ApiMeta = {
	requestId: string
	nextCursor: string
}

export type ApiErrorDetail = {
	field: string
	code: string
	message: string
}

export type ApiSuccess<T> = {
	success: true
	data: T
	meta: ApiMeta
}

export type ApiFailure = {
	success: false
	error: {
		code: ErrorCode
		message: string
		details: ApiErrorDetail[]
	}
	meta: ApiMeta
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export type Collection<T> = {
	items: T[]
	nextCursor: string
}
