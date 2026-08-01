import { useState } from "react"
import { Navigate, Outlet } from "react-router"
import { useSession } from "../auth/use-session"
import { Skeleton } from "../components/ui/skeleton"
import { cn } from "../lib/utils"
import { Sidebar } from "./sidebar"

const COLLAPSE_KEY = "smartplate.sidebar.collapsed"

export const AppShell = ({ expect }: { expect: "restaurant" | "ngo" | "admin" }) => {
	const { session, isPending } = useSession()
	const [collapsed, setCollapsed] = useState(
		() => window.localStorage.getItem(COLLAPSE_KEY) === "true",
	)

	const toggle = () => {
		setCollapsed((current) => {
			window.localStorage.setItem(COLLAPSE_KEY, String(!current))
			return !current
		})
	}

	if (isPending) {
		return (
			<div className="flex min-h-screen">
				<div className="hidden w-64 border-r border-sidebar-border bg-sidebar p-4 md:block">
					<Skeleton className="h-8 w-36" />
					<div className="mt-6 space-y-2">
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
				</div>
				<div className="flex-1 p-8">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="mt-6 h-40 w-full" />
				</div>
			</div>
		)
	}

	if (session == null) return <Navigate to="/login" replace />

	const actual = session.user.role === "super_admin" ? "admin" : session.tenant.type
	if (actual !== expect) return <Navigate to="/" replace />

	return (
		<div className="flex min-h-screen bg-background">
			<aside
				className={cn(
					"hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 ease-out md:block",
					collapsed ? "w-16" : "w-64",
				)}
			>
				<div className="sticky top-0 h-screen">
					<Sidebar session={session} collapsed={collapsed} onToggle={toggle} />
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<main className="flex-1 px-6 py-8 lg:px-10">
					<Outlet />
				</main>
			</div>
		</div>
	)
}
