import { SQL } from "bun"
import Redis from "ioredis"

export type DependencyStatus = "ok" | "unreachable"

export type HealthReport = {
	service: "main-service"
	status: "ok" | "degraded"
	dependencies: {
		postgres: DependencyStatus
		redis: DependencyStatus
		agentService: DependencyStatus
	}
}

const checkPostgres = async (): Promise<DependencyStatus> => {
	const url = process.env.DATABASE_URL
	if (url == null || url === "") return "unreachable"

	const sql = new SQL(url)
	try {
		await sql`select 1`
		return "ok"
	} catch {
		return "unreachable"
	} finally {
		await sql.end()
	}
}

const checkRedis = async (): Promise<DependencyStatus> => {
	const url = process.env.REDIS_URL
	if (url == null || url === "") return "unreachable"

	const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true })
	try {
		await redis.connect()
		await redis.ping()
		return "ok"
	} catch {
		return "unreachable"
	} finally {
		redis.disconnect()
	}
}

const checkAgentService = async (): Promise<DependencyStatus> => {
	const url = process.env.AGENT_SERVICE_URL
	if (url == null || url === "") return "unreachable"

	try {
		const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
		return response.ok ? "ok" : "unreachable"
	} catch {
		return "unreachable"
	}
}

export const getHealthReport = async (): Promise<HealthReport> => {
	const [postgres, redis, agentService] = await Promise.all([
		checkPostgres(),
		checkRedis(),
		checkAgentService(),
	])

	const dependencies = { postgres, redis, agentService }
	const allOk = Object.values(dependencies).every((status) => status === "ok")

	return { service: "main-service", status: allOk ? "ok" : "degraded", dependencies }
}
