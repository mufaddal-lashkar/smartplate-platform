import type { Dayjs } from "dayjs"
import dayjs from "dayjs"
import { MainApiError } from "./main-client"

const COUNTABLE_UNITS = new Set(["plate", "piece", "portion", "serving"])

export const esc = (text: string): string =>
	text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const bold = (text: string): string => `<b>${esc(text)}</b>`

export const italic = (text: string): string => `<i>${esc(text)}</i>`

export const money = (value: string | number): string => `₹${Number(value).toLocaleString("en-IN")}`

export const qty = (value: string | number, unit: string): string => {
	const amount = Number(value)
	if (!COUNTABLE_UNITS.has(unit)) return `${amount} ${unit}`
	return `${amount} ${unit}${amount === 1 ? "" : "s"}`
}

export const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`

export const until = (iso: string, now: Dayjs): string => {
	const minutes = dayjs(iso).diff(now, "minute")
	if (minutes <= 0) return "expired"
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	if (hours === 0) return `safe for ${rest}m`
	return `safe for ${hours}h ${rest}m`
}

export const clock = (iso: string): string => dayjs(iso).format("HH:mm")

export const lines = (parts: string[]): string => parts.filter((part) => part !== "").join("\n")

export const heading = (title: string, count: number): string => `<b>${esc(title)}</b> — ${count}`

export const empty = (message: string, hint: string): string =>
	lines([esc(message), hint === "" ? "" : italic(hint)])

export const truncate = (rows: string[], limit: number, more: string): string => {
	if (rows.length <= limit) return rows.join("\n")
	const shown = rows.slice(0, limit).join("\n")
	const dropped = rows.length - limit
	const pointer =
		more === "" ? `…${dropped} more` : `…${dropped} more — send ${more} for the full list`
	return `${shown}\n\n${italic(pointer)}`
}

const ERROR_SENTENCES: Record<string, string> = {
	LISTING_UNAVAILABLE: "That one has already been taken. Here's what's still open.",
	LISTING_ALREADY_CLAIMED: "That one has already been taken. Here's what's still open.",
	LISTING_NOT_OPEN: "That listing isn't open any more.",
	LISTING_OUT_OF_RANGE: "That listing is outside your pickup radius.",
	AUTH_FORBIDDEN: "That action isn't available to this persona.",
	TENANT_TYPE_MISMATCH: "That action isn't available to this persona.",
	AUTH_TOKEN_EXPIRED: "Your link expired. Send /start to link this chat again.",
	RESOURCE_NOT_FOUND: "I couldn't find that any more — it may have just changed.",
	VALIDATION_FAILED: "Some of those details didn't look right.",
	VALIDATION_ERROR: "Some of those details didn't look right.",
	DISPOSITION_ALREADY_DECIDED: "That leftover has already been decided.",
	DISPOSITION_SPLIT_MISMATCH: "Those quantities don't add up to the leftover.",
	LEFTOVER_PAST_SAFE_UNTIL: "That leftover is past its safe-until time.",
	INSUFFICIENT_STOCK: "There isn't enough stock for that.",
	REUSE_EXCEEDS_RETAIN: "You can't reuse more than you retained.",
	RATE_LIMITED: "Too many requests just now — give it a moment.",
	AI_UNAVAILABLE: "The assistant is offline right now. Try again shortly.",
	SERVICE_UNAVAILABLE: "That service is offline right now. Try again shortly.",
	REPORT_NOT_READY: "That report is still rendering. Give it a moment.",
}

export const errorLine = (error: Error): string => {
	if (error instanceof MainApiError) {
		const sentence = ERROR_SENTENCES[error.code] ?? ""
		if (sentence !== "") return esc(sentence)
	}
	return esc("Something went wrong on my side. Try again, or send /menu.")
}
