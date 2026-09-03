import { commandIntents, findIntent, WORKED_EXAMPLE_INTENTS } from "@smartplate/contracts/intents"
import { bold, esc, italic, lines } from "../../format"
import type { BotContext } from "../bot"
import { sendReply } from "../reply"

export const helpText = (): string => {
	const examples = WORKED_EXAMPLE_INTENTS.map((name) => findIntent(name)?.example ?? "").filter(
		(example) => example !== "",
	)
	const commands = commandIntents().map((entry) => `/${entry.command} — ${esc(entry.buttonLabel)}`)
	return lines([
		bold("Just tell me what happened"),
		...examples.map((example) => `• ${italic(example)}`),
		"",
		bold("Or use a command"),
		"/start — link this chat or switch persona",
		"/menu — everything I can do",
		...commands,
		"/cancel — stop what you're doing",
		"",
		italic("Lists come with buttons — tap one instead of typing an id."),
	])
}

export const callHelp = async (ctx: BotContext): Promise<void> => {
	await sendReply(ctx, { text: helpText() })
}
