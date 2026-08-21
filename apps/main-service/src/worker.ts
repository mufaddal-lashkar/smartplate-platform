import { Queue, Worker } from "bullmq"
import dayjs from "dayjs"
import Redis from "ioredis"
import { publishEvent } from "./modules/events/events.service"
import {
	ESCALATION_QUEUE,
	ESCALATION_SWEEP_JOB,
	ESCALATION_SWEEP_MS,
	type EscalationJob,
	escalateListing,
	escalationQueue,
	sweepDueEscalations,
} from "./modules/listings/listings.service"
import { systemClock } from "./shared/clock"

const connection = new Redis(process.env.REDIS_URL ?? "redis://redis:6379", {
	maxRetriesPerRequest: null,
})

export const PING_QUEUE = "ping"

export type PingJob = {
	tenantId: string
}

export const pingQueue = new Queue<PingJob>(PING_QUEUE, { connection })

const worker = new Worker<PingJob>(
	PING_QUEUE,
	async (job) => ({ ok: true, receivedAt: dayjs().toISOString(), tenantId: job.data.tenantId }),
	{ connection },
)

worker.on("ready", () => console.log(`[worker] listening on queue "${PING_QUEUE}"`))

worker.on("completed", async (job) => {
	if (job.data.tenantId == null || job.data.tenantId === "") return
	await publishEvent(job.data.tenantId, {
		topic: "jobs",
		name: "job.completed",
		data: { jobId: String(job.id), kind: PING_QUEUE },
	})
})

worker.on("failed", (job, error) => console.error(`[worker] ${job?.id} failed`, error))

const escalationWorker = new Worker<EscalationJob>(
	ESCALATION_QUEUE,
	async (job) => {
		if (job.name === ESCALATION_SWEEP_JOB) {
			return { swept: await sweepDueEscalations(systemClock) }
		}
		return {
			escalated: await escalateListing(job.data.listingId, job.data.tenantId, systemClock),
		}
	},
	{ connection },
)

escalationWorker.on("ready", () => console.log(`[worker] listening on queue "${ESCALATION_QUEUE}"`))

escalationWorker.on("failed", (job, error) =>
	console.error(`[worker] ${ESCALATION_QUEUE} ${job?.id} failed`, error),
)

await escalationQueue.upsertJobScheduler(
	ESCALATION_SWEEP_JOB,
	{ every: ESCALATION_SWEEP_MS },
	{ name: ESCALATION_SWEEP_JOB, data: { listingId: "", tenantId: "" } },
)

const shutdown = async () => {
	await worker.close()
	await escalationWorker.close()
	await pingQueue.close()
	await escalationQueue.close()
	connection.disconnect()
	process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
