import { Navigate, Outlet } from "react-router"
import { useLogout, useSession } from "../auth/use-session"
import { Sidebar } from "./sidebar"

export const AppShell = ({ expect }: { expect: "restaurant" | "ngo" | "admin" }) => {
	const { session, isPending } = useSession()
	const logout = useLogout()

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center text-muted-foreground">
				Loading…
			</div>
		)
	}

	if (session == null) return <Navigate to="/login" replace />

	const actual = session.user.role === "super_admin" ? "admin" : session.tenant.type
	if (actual !== expect) return <Navigate to="/" replace />

	return (
		<div className="flex min-h-screen">
			<aside className="hidden w-60 shrink-0 border-r border-border bg-background md:block">
				<Sidebar session={session} />
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex items-center justify-between border-b border-border px-6 py-3">
					<p className="text-sm text-muted-foreground">{session.tenant.name}</p>
					<div className="flex items-center gap-3">
						<span className="text-sm">{session.user.name}</span>
						<button
							type="button"
							onClick={() => logout.mutate()}
							className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-card"
						>
							Sign out
						</button>
					</div>
				</header>

				<main className="flex-1 p-6">
					<Outlet />
				</main>
			</div>
		</div>
	)
}
