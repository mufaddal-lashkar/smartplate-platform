import { type QueryClient, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { queryKeys } from "../lib/query-keys"

export type StreamStatus = "connecting" | "open" | "closed"

export type AppEvent = {
	id: string
	name: string
	data: Record<string, string | number>
	receivedAt: number
}

export type EventStream = {
	events: AppEvent[]
	status: StreamStatus
}

const STREAM_PATH = "/api/v1/events"
const MAX_EVENTS = 50
const RETRY_STEP_MS = 2_000
const RETRY_CEILING_MS = 30_000

const dashboardScope = [queryKeys.dashboard("", "")[0]]
const leftoverScope = [queryKeys.leftovers("")[0]]
const listingScope = [queryKeys.listings()[0]]

const INVALIDATED_BY: Record<string, string[][]> = {
	"listing.created": [listingScope, leftoverScope, dashboardScope],
	"listing.escalated": [listingScope, dashboardScope],
	"job.completed": [listingScope, dashboardScope],
	"notification.created": [],
}

const STREAM_NAMES = Object.keys(INVALIDATED_BY)

let snapshot: EventStream = { events: [], status: "closed" }
let source: EventSource | null = null
let client: QueryClient | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let attempts = 0
let sequence = 0

const subscribers = new Set<(value: EventStream) => void>()

const publish = (next: EventStream) => {
	snapshot = next
	for (const notify of subscribers) notify(next)
}

const setStatus = (status: StreamStatus) => {
	if (snapshot.status === status) return
	publish({ events: snapshot.events, status })
}

const invalidate = (name: string) => {
	const targets = INVALIDATED_BY[name]
	if (client == null || targets == null) return
	for (const queryKey of targets) client.invalidateQueries({ queryKey })
}

const record = (name: string, payload: string) => {
	sequence += 1
	const event: AppEvent = {
		id: `${name}:${sequence}`,
		name,
		data: JSON.parse(payload),
		receivedAt: Date.now(),
	}
	publish({
		events: [event, ...snapshot.events].slice(0, MAX_EVENTS),
		status: snapshot.status,
	})
	invalidate(name)
}

const scheduleReconnect = () => {
	if (retryTimer != null || subscribers.size === 0) return
	attempts += 1
	retryTimer = setTimeout(
		() => {
			retryTimer = null
			if (subscribers.size > 0) connect()
		},
		Math.min(attempts * RETRY_STEP_MS, RETRY_CEILING_MS),
	)
}

function connect() {
	if (source != null) return
	setStatus("connecting")

	const stream = new EventSource(STREAM_PATH)
	source = stream

	stream.onopen = () => {
		attempts = 0
		setStatus("open")
	}

	stream.onerror = () => {
		stream.close()
		if (source === stream) source = null
		setStatus("closed")
		scheduleReconnect()
	}

	for (const name of STREAM_NAMES) {
		stream.addEventListener(name, (event) => record(name, (event as MessageEvent<string>).data))
	}
}

const disconnect = () => {
	if (retryTimer != null) clearTimeout(retryTimer)
	retryTimer = null
	attempts = 0
	source?.close()
	source = null
	setStatus("closed")
}

export const useEvents = (): EventStream => {
	const queryClient = useQueryClient()
	const [stream, setStream] = useState<EventStream>(snapshot)

	useEffect(() => {
		client = queryClient
		subscribers.add(setStream)
		setStream(snapshot)
		connect()

		return () => {
			subscribers.delete(setStream)
			if (subscribers.size === 0) disconnect()
		}
	}, [queryClient])

	return stream
}
