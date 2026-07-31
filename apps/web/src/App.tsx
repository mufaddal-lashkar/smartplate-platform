import type { ApiResponse } from "@smartplate/contracts/envelope"
import { useQuery } from "@tanstack/react-query"

type DependencyStatus = "ok" | "unreachable"

type HealthReport = {
	service: string
	status: "ok" | "degraded"
	dependencies: Record<string, DependencyStatus>
}

const LABELS: Record<string, string> = {
	postgres: "PostgreSQL",
	redis: "Redis",
	agentService: "agent-service",
}

const fetchHealth = async (): Promise<HealthReport> => {
	const response = await fetch("/api/v1/health")
	const body: ApiResponse<HealthReport> = await response.json()
	if (!body.success) throw new Error(body.error.code)
	return body.data
}

const StatusRow = ({ name, ok }: { name: string; ok: boolean }) => (
	<li className="flex items-center justify-between border-b border-border pb-2 last:border-0">
		<span>{name}</span>
		<span className={ok ? "text-sm font-medium text-good" : "text-sm font-medium text-critical"}>
			{ok ? "● ok" : "▲ unreachable"}
		</span>
	</li>
)

export const App = () => {
	const { data, isPending, error } = useQuery({
		queryKey: ["health"],
		queryFn: fetchHealth,
		refetchInterval: 5000,
	})

	return (
		<main className="mx-auto max-w-2xl px-6 py-16">
			<h1 className="text-xl font-semibold tracking-tight">SmartPlate</h1>
			<p className="mt-1 text-muted-foreground">
				Platform scaffold — P0. This page exists to prove the topology is wired end to end.
			</p>

			<section className="mt-8 rounded-lg border border-border bg-card p-5 text-card-foreground">
				<h2 className="text-sm font-medium uppercase tracking-wide text-subtle-foreground">
					Service health
				</h2>

				{isPending && <p className="mt-4">Checking…</p>}

				{error != null && (
					<p className="mt-4 text-critical">
						main-service unreachable — is `docker compose up` still starting?
					</p>
				)}

				{data != null && (
					<ul className="mt-4 space-y-2">
						<StatusRow name="main-service" ok={data.status === "ok"} />
						{Object.entries(data.dependencies).map(([key, value]) => (
							<StatusRow key={key} name={LABELS[key] ?? key} ok={value === "ok"} />
						))}
					</ul>
				)}
			</section>
		</main>
	)
}
