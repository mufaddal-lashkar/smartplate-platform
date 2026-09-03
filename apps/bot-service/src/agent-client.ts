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
	return (await response.json().catch(() => null)) as ParseIntentResponse | null
}

export type PlanStepWire = {
	intent: string
	params: Record<string, string | number | boolean>
	rationale: string
	requiresConfirmation: boolean
}

export type PlanIntentResponse = {
	promptVersion: string
	model: string
	source: "model" | "deterministic"
	plan: PlanStepWire[]
	confidence: number
	needsClarification: string[]
	basis: string
}

export type CallPlanAgentRequest = {
	requestId: string
	text: string
	locale?: string
	context?: Array<{ role: "user" | "assistant"; text: string }>
	userRole: "super_admin" | "owner" | "staff" | "ngo_admin" | "ngo_volunteer"
	tenantType: "restaurant" | "ngo"
	today: string
	tenantId?: string
}

export const callPlanAgent = async (
	request: CallPlanAgentRequest,
): Promise<PlanIntentResponse | null> => {
	const response = await fetch(`${config.agentUrl}/v1/plan-intent`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-service-token": config.serviceToken,
		},
		body: JSON.stringify(request),
		signal: AbortSignal.timeout(config.requestTimeoutMs),
	}).catch(() => null)
	if (response == null || !response.ok) return null
	type WireStep = {
		intent?: string
		params?: PlanStepWire["params"]
		rationale?: string
		requiresConfirmation?: boolean
		requires_confirmation?: boolean
	}
	type WireResponse = {
		promptVersion?: string
		prompt_version?: string
		model?: string
		source?: "model" | "deterministic"
		confidence?: number
		needsClarification?: string[]
		needs_clarification?: string[]
		basis?: string
		plan?: WireStep[]
	}
	const raw = (await response.json().catch(() => null)) as WireResponse | null
	if (raw == null) return null
	return {
		promptVersion: raw.promptVersion ?? raw.prompt_version ?? "",
		model: raw.model ?? "",
		source: raw.source ?? "model",
		confidence: raw.confidence ?? 0,
		needsClarification: raw.needsClarification ?? raw.needs_clarification ?? [],
		basis: raw.basis ?? "",
		plan: (raw.plan ?? []).map((step) => ({
			intent: step.intent ?? "",
			params: step.params ?? {},
			rationale: step.rationale ?? "",
			requiresConfirmation: step.requiresConfirmation ?? step.requires_confirmation ?? false,
		})),
	}
}
