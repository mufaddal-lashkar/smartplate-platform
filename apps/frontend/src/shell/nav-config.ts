import type { MeResponse } from "@smartplate/contracts/auth"

export type NavItem = {
	group: string
	label: string
	to: string
	permission: string
}

const RESTAURANT_NAV: NavItem[] = [
	{ group: "Operations", label: "Dashboard", to: "/app", permission: "" },
	{ group: "Operations", label: "Inventory", to: "/app/inventory", permission: "inventory.read" },
	{ group: "Operations", label: "Kitchen", to: "/app/kitchen", permission: "prep.write" },
	{ group: "Operations", label: "Leftovers", to: "/app/leftovers", permission: "leftover.write" },
	{ group: "Marketplace", label: "My Listings", to: "/app/listings", permission: "" },
	{ group: "Marketplace", label: "Browse Surplus", to: "/app/market", permission: "" },
	{ group: "Insights", label: "Analytics", to: "/app/analytics", permission: "reports.read" },
	{ group: "Insights", label: "Reports", to: "/app/reports", permission: "reports.read" },
	{ group: "Settings", label: "Catalog", to: "/app/catalog", permission: "inventory.read" },
	{ group: "Settings", label: "Team", to: "/app/team", permission: "users.manage" },
	{ group: "Settings", label: "Settings", to: "/app/settings", permission: "settings.write" },
]

const NGO_NAV: NavItem[] = [
	{ group: "", label: "Available Food", to: "/ngo", permission: "" },
	{ group: "", label: "My Pickups", to: "/ngo/pickups", permission: "listing.complete" },
	{ group: "", label: "Organisation", to: "/ngo/organisation", permission: "settings.write" },
	{ group: "", label: "Team", to: "/ngo/team", permission: "users.manage" },
]

const ADMIN_NAV: NavItem[] = [
	{ group: "", label: "Tenants", to: "/admin", permission: "platform.analytics" },
	{ group: "", label: "Verification", to: "/admin/verification", permission: "ngo.verify" },
	{
		group: "",
		label: "Platform Analytics",
		to: "/admin/analytics",
		permission: "platform.analytics",
	},
]

export const navItemsFor = (session: MeResponse): NavItem[] => {
	const source =
		session.user.role === "super_admin"
			? ADMIN_NAV
			: session.tenant.type === "restaurant"
				? RESTAURANT_NAV
				: NGO_NAV

	return source.filter(
		(item) => item.permission === "" || session.permissions.includes(item.permission),
	)
}

export const groupNavItems = (items: NavItem[]): { group: string; items: NavItem[] }[] => {
	const groups: { group: string; items: NavItem[] }[] = []

	for (const item of items) {
		const existing = groups.find((g) => g.group === item.group)
		if (existing == null) groups.push({ group: item.group, items: [item] })
		else existing.items.push(item)
	}

	return groups
}
