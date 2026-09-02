import { Elysia, t } from "elysia"
import { requireServiceToken } from "./bot.guard"
import { bindSchema, startSessionSchema } from "./bot.schema"
import { bindChat, startSession, unbindChat } from "./bot.service"

export const botRoute = new Elysia({ prefix: "/v1/bot" })
	.use(requireServiceToken)
	.post(
		"/bind",
		({ body }) => {
			const input = bindSchema.parse(body)
			return bindChat(input)
		},
		{
			body: t.Object({
				chatId: t.Number(),
				tenantCode: t.String(),
				email: t.String(),
			}),
		},
	)
	.post(
		"/session",
		({ body }) => {
			const input = startSessionSchema.parse(body)
			return startSession("", input)
		},
		{
			body: t.Object({
				refreshToken: t.String(),
			}),
		},
	)
	.delete(
		"/bind/:chatId",
		({ params }) => {
			const chatId = Number(params.chatId)
			if (!Number.isInteger(chatId) || chatId <= 0) {
				throw new Error("chatId must be a positive integer")
			}
			return unbindChat(chatId).then(() => ({ ok: true }))
		},
		{
			params: t.Object({ chatId: t.String() }),
		},
	)
