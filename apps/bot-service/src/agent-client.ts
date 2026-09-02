import { config } from "./config"

export type ParseIntentRequest = {
	requestId: string
	text: string
	locale?: string
	context?: Array<{ role: "user" | "assistant"; text: string }>
	userRole: "super_admin" | "owner" | "staff" | "ngo_admin" | "ngo_volunteer"
	tenantType: "restaurant" | "ngo"
}

export type ParseIntentResponse = {
	intent: string
	confidence: number
	entities: Record<string, string | number | boolean | string[]>
	needs_clarification: string[]
	basis: string
	prompt_version: string
	model: string
	source: "model" | "deterministic"
}

export const callAgent = async (
	request: ParseIntentRequest,
): Promise<ParseIntentResponse | null> => {
	const response = await fetch(`${config.agentUrl}/v1/parse-intent`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-service-token": config.serviceToken,
		},
		body: JSON.stringify(request),
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	}).catch(() => null)
	if (response == null || !response.ok) return null
	const body = (await response.json()) as { data?: ParseIntentResponse }
	return body.data ?? null
}
