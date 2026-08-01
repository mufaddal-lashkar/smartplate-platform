import { Elysia } from "elysia"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import { type DomainEvent, subscribeToTenant } from "./events.service"

const HEARTBEAT_MS = 20_000

export const eventsRoute = new Elysia().use(sessionPlugin).get("/v1/events", ({ session }) => {
	const active = requireSession(session)
	const encoder = new TextEncoder()

	let unsubscribe: () => void = () => undefined
	let heartbeat: ReturnType<typeof setInterval> | null = null

	const release = () => {
		if (heartbeat != null) clearInterval(heartbeat)
		heartbeat = null
		unsubscribe()
		unsubscribe = () => undefined
	}

	const stream = new ReadableStream({
		start(controller) {
			const send = (event: DomainEvent) => {
				controller.enqueue(
					encoder.encode(`event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`),
				)
			}

			controller.enqueue(encoder.encode(": connected\n\n"))

			unsubscribe = subscribeToTenant(active.tenantId, send)
			heartbeat = setInterval(() => {
				controller.enqueue(encoder.encode(": ping\n\n"))
			}, HEARTBEAT_MS)
		},
		cancel() {
			release()
		},
	})

	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
		},
	})
})
