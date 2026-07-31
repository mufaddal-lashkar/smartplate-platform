import { Queue, Worker } from "bullmq"
import dayjs from "dayjs"
import Redis from "ioredis"

const connection = new Redis(process.env.REDIS_URL ?? "redis://redis:6379", {
	maxRetriesPerRequest: null,
})

export const PING_QUEUE = "ping"

export const pingQueue = new Queue(PING_QUEUE, { connection })

const worker = new Worker(
	PING_QUEUE,
	async () => ({ ok: true, receivedAt: dayjs().toISOString() }),
	{
		connection,
	},
)

worker.on("ready", () => console.log(`[worker] listening on queue "${PING_QUEUE}"`))
worker.on("failed", (job, error) => console.error(`[worker] ${job?.id} failed`, error))

const shutdown = async () => {
	await worker.close()
	await pingQueue.close()
	connection.disconnect()
	process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
