import { createBrowserRouter, Navigate } from "react-router"
import { LoginPage } from "./auth/login-page"
import { RegisterPage } from "./auth/register-page"
import { homePathFor, useSession } from "./auth/use-session"
import { AnalyticsPage } from "./pages/analytics-page"
import { CatalogPage } from "./pages/catalog-page"
import { DashboardPage } from "./pages/dashboard-page"
import { InventoryPage } from "./pages/inventory-page"
import { KitchenPage } from "./pages/kitchen-page"
import { LeftoversPage } from "./pages/leftovers-page"
import { ListingsPage } from "./pages/listings-page"
import { MarketPage } from "./pages/market-page"
import { MethodologyPage } from "./pages/methodology-page"
import { NgoIndexPage } from "./pages/ngo/index-page"
import { NgoPickupsPage } from "./pages/ngo/pickups-page"
import { NotFoundPage, PlaceholderPage } from "./pages/placeholder-page"
import { ReportsPage } from "./pages/reports-page"
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
			{ path: "inventory", element: <InventoryPage /> },
			{ path: "kitchen", element: <KitchenPage /> },
			{ path: "leftovers", element: <LeftoversPage /> },
			{ path: "listings", element: <ListingsPage /> },
			{ path: "market", element: <MarketPage /> },
			{ path: "analytics", element: <AnalyticsPage /> },
			{ path: "reports", element: <ReportsPage /> },
			{ path: "methodology", element: <MethodologyPage /> },
			{ path: "catalog", element: <CatalogPage /> },
			{ path: "team", element: <PlaceholderPage title="Team" phase="P8" /> },
			{ path: "settings", element: <PlaceholderPage title="Settings" phase="P8" /> },
		],
	},
	{
		path: "/ngo",
		element: <AppShell expect="ngo" />,
		children: [
			{ index: true, element: <NgoIndexPage /> },
			{ path: "pickups", element: <NgoPickupsPage /> },
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
