import { createBrowserRouter, Navigate } from "react-router"
import { LoginPage } from "./auth/login-page"
import { RegisterPage } from "./auth/register-page"
import { homePathFor, useSession } from "./auth/use-session"
import { CatalogPage } from "./pages/catalog-page"
import { DashboardPage } from "./pages/dashboard-page"
import { LeftoversPage } from "./pages/leftovers-page"
import { ListingsPage } from "./pages/listings-page"
import { NotFoundPage, PlaceholderPage } from "./pages/placeholder-page"
import { AppShell } from "./shell/app-shell"

const RootRedirect = () => {
	const { session, isPending } = useSession()

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center text-muted-foreground">
				Loading…
			</div>
		)
	}

	return <Navigate to={homePathFor(session)} replace />
}

export const router = createBrowserRouter([
	{ path: "/", element: <RootRedirect /> },
	{ path: "/login", element: <LoginPage /> },
	{ path: "/register", element: <RegisterPage /> },
	{
		path: "/app",
		element: <AppShell expect="restaurant" />,
		children: [
			{ index: true, element: <DashboardPage /> },
			{ path: "inventory", element: <PlaceholderPage title="Inventory" phase="P1" /> },
			{ path: "kitchen", element: <PlaceholderPage title="Kitchen" phase="P2" /> },
			{ path: "leftovers", element: <LeftoversPage /> },
			{ path: "listings", element: <ListingsPage /> },
			{ path: "market", element: <PlaceholderPage title="Browse surplus" phase="P4" /> },
			{ path: "analytics", element: <PlaceholderPage title="Analytics" phase="P7" /> },
			{ path: "reports", element: <PlaceholderPage title="Reports" phase="P8" /> },
			{ path: "catalog", element: <CatalogPage /> },
			{ path: "team", element: <PlaceholderPage title="Team" phase="P8" /> },
			{ path: "settings", element: <PlaceholderPage title="Settings" phase="P8" /> },
		],
	},
	{
		path: "/ngo",
		element: <AppShell expect="ngo" />,
		children: [
			{ index: true, element: <PlaceholderPage title="Available food" phase="P4" /> },
			{ path: "pickups", element: <PlaceholderPage title="My pickups" phase="P4" /> },
			{ path: "organisation", element: <PlaceholderPage title="Organisation" phase="P8" /> },
			{ path: "team", element: <PlaceholderPage title="Team" phase="P8" /> },
		],
	},
	{
		path: "/admin",
		element: <AppShell expect="admin" />,
		children: [
			{ index: true, element: <PlaceholderPage title="Tenants" phase="P8" /> },
			{ path: "verification", element: <PlaceholderPage title="NGO verification" phase="P8" /> },
			{ path: "analytics", element: <PlaceholderPage title="Platform analytics" phase="P8" /> },
		],
	},
	{ path: "*", element: <NotFoundPage /> },
])
