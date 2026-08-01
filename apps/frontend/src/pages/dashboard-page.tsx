import { useSession } from "../auth/use-session"

export const DashboardPage = () => {
	const { session } = useSession()

	return (
		<section>
			<h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
			<p className="mt-1 text-sm text-muted-foreground">
				Signed in as {session?.user.name} · {session?.user.role.replace("_", " ")}
			</p>

			<div className="mt-6 rounded-lg border border-dashed border-border bg-card p-8">
				<p className="text-sm text-muted-foreground">
					Metrics arrive in P7, once there is history to measure.
				</p>
				<p className="mt-1 text-xs text-subtle-foreground">
					Recovery rate, surplus rate, waste rate, value recovered, and carbon avoided.
				</p>
			</div>
		</section>
	)
}
