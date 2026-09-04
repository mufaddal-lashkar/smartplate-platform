import { findIntent } from "@smartplate/contracts/intents"
import dayjs from "dayjs"
import { callPlanAgent, type PlanStepWire } from "./agent-client"
import type { BotContext } from "./bot/bot"
import { requireChatId } from "./bot/bot"
import { btn, row, sendReply } from "./bot/reply"
import { errorLine, esc, italic, lines } from "./format"
import { dispatchTable } from "./handlers"
import { logger } from "./logger"
import { getSession } from "./main-client"
import { parseFallback } from "./parse-fallback"
import { findFirstMissing, type Resolution, resolveParams } from "./plan-params"
import { encodeConfirm, mintToken } from "./resolver"

type AgentRole = "super_admin" | "owner" | "staff" | "ngo_admin" | "ngo_volunteer"

type PlanStepResolved = {
	step: PlanStepWire
	spec: NonNullable<ReturnType<typeof findIntent>>
}

const flatten = (
	entities: Record<string, string | number | boolean | string[]>,
): Record<string, string> => {
	const out: Record<string, string> = {}
	for (const [key, value] of Object.entries(entities)) {
		out[key] = Array.isArray(value) ? JSON.stringify(value) : String(value)
	}
	return out
}

const buildFallbackPlan = (text: string): { plan: PlanStepWire[]; basis: string } => {
	const fallback = parseFallback(text)
	if (fallback.intent === "unknown") {
		return {
			plan: [
				{
					intent: "menu",
					params: {},
					rationale: "fallback parser could not classify the user text",
					requiresConfirmation: false,
				},
			],
			basis: "fallback parser returned unknown",
		}
	}
	return {
		plan: [
			{
				intent: fallback.intent,
				params: flatten(fallback.entities),
				rationale: "deterministic fallback matched a keyword",
				requiresConfirmation: fallback.requiresConfirmation,
			},
		],
		basis: `deterministic fallback for '${fallback.intent}'`,
	}
}

const renderMissingReply = async (
	ctx: BotContext,
	intent: string,
	missing: string[],
): Promise<void> => {
	const spec = findIntent(intent)
	if (spec != null && spec.listIntent !== "") {
		await runSingleStep(ctx, spec.listIntent, {}, "")
		return
	}
	const example = spec?.example ?? ""
	const exampleLine = example === "" ? "" : italic(`Try: ${example}`)
	await sendReply(ctx, {
		text: lines([esc(`I need ${missing.join(" and ")} for that.`), exampleLine]),
	})
}

const runSingleStep = async (
	ctx: BotContext,
	intent: string,
	entities: Record<string, string | number | boolean>,
	idempotencyKey: string,
): Promise<void> => {
	const handler = dispatchTable[intent]
	if (handler == null) {
		await sendReply(ctx, { text: esc("That isn't wired up yet. Send /menu.") })
		return
	}
	const stringEntities: Record<string, string> = {}
	for (const [key, value] of Object.entries(entities)) {
		stringEntities[key] = String(value)
	}
	try {
		const reply = await handler(ctx, stringEntities, { idempotencyKey })
		await sendReply(ctx, reply)
	} catch (error) {
		const failure = error instanceof Error ? error : new Error("unknown handler failure")
		logger.warn({ intent, error: failure.message }, "handler error")
		await sendReply(ctx, { text: errorLine(failure) })
	}
}

const executeStep = async (
	ctx: BotContext,
	chatId: number,
	resolved: PlanStepResolved,
	idempotencyKey: string,
): Promise<"done" | "halted"> => {
	const { step, spec } = resolved
	if (step.intent !== spec.intent) {
		await sendReply(ctx, { text: esc("That isn't wired up yet. Send /menu.") })
		return "halted"
	}

	let resolution: Resolution
	try {
		resolution = await resolveParams(ctx, step.intent, step.params)
	} catch (error) {
		const failure = error instanceof Error ? error : new Error("param resolution failed")
		logger.warn({ chatId, intent: step.intent, error: failure.message }, "param rejection")
		await sendReply(ctx, { text: esc(failure.message) })
		return "halted"
	}

	if (resolution.clarification != null && resolution.clarification.kind === "dish") {
		const candidates = resolution.clarification.candidates
			.slice(0, 5)
			.map((dish) => `• ${esc(dish.name)}`)
			.join("\n")
		await sendReply(ctx, {
			text: lines([
				esc(`Which one did you mean: ${resolution.clarification.name}?`),
				candidates,
				italic("Reply with the dish name."),
			]),
		})
		return "halted"
	}

	const missing =
		resolution.missing.length > 0 ? resolution.missing : findFirstMissing(step.intent, step.params)
	if (missing.length > 0) {
		await renderMissingReply(ctx, step.intent, missing)
		return "halted"
	}

	const entities = { ...step.params, ...resolution.resolved }
	const stringEntities: Record<string, string> = {}
	for (const [key, value] of Object.entries(entities)) {
		stringEntities[key] = String(value)
	}
	if (step.requiresConfirmation || spec.destructive) {
		const token = await mintToken(chatId, stringEntities)
		await sendReply(ctx, {
			text: lines([esc("Go ahead?"), italic("This can't be undone.")]),
			rows: [
				row([btn("Yes, do it", encodeConfirm(step.intent, token)), btn("No, cancel", "noop")]),
			],
		})
		return "halted"
	}

	await runSingleStep(ctx, step.intent, stringEntities, idempotencyKey)
	return "done"
}

export const planDispatch = async (ctx: BotContext): Promise<void> => {
	if (ctx.message?.text == null) return
	const text = ctx.message.text
	const chatId = requireChatId(ctx)
	const updateId = ctx.update.update_id
	const idempotencyKey = `bot:msg:${chatId}:${updateId}`

	const session = await getSession(chatId)
	if (session == null) {
		await sendReply(ctx, { text: esc("Send /start to link this chat first.") })
		return
	}

	const plan = await callPlanAgent({
		requestId: `${chatId}-${updateId}`,
		text,
		userRole: session.role as AgentRole,
		tenantType: session.tenantType,
		today: dayjs().format("YYYY-MM-DD"),
		tenantId: session.tenantId,
		userId: session.userId,
	})

	let steps: PlanStepWire[] = []
	if (plan != null && plan.plan.length > 0) {
		steps = plan.plan
	} else {
		const fallback = buildFallbackPlan(text)
		steps = fallback.plan
		logger.info({ chatId, updateId, basis: fallback.basis }, "using fallback plan")
	}

	for (const step of steps) {
		const spec = findIntent(step.intent)
		if (spec == null) {
			await sendReply(ctx, { text: esc("I didn't catch that.") })
			return
		}
		const outcome = await executeStep(ctx, chatId, { step, spec }, idempotencyKey)
		if (outcome === "halted") return
	}
}
