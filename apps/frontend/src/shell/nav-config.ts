import type { MeResponse } from "@smartplate/contracts/auth"
import {
	BarChart3Icon,
	BuildingIcon,
	ChefHatIcon,
	FileTextIcon,
	type LucideIcon,
	PackageIcon,
	SettingsIcon,
	ShieldCheckIcon,
	ShoppingBasketIcon,
	SoupIcon,
	StoreIcon,
	TagIcon,
	UsersIcon,
	UtensilsCrossedIcon,
} from "lucide-react"

export type NavItem = {
	group: string
	label: string
	to: string
	permission: string
	icon: LucideIcon
}

const RESTAURANT_NAV: NavItem[] = [
	{ group: "Operations", label: "Dashboard", to: "/app", permission: "", icon: BarChart3Icon },
	{
		group: "Operations",
		label: "Inventory",
		to: "/app/inventory",
		permission: "inventory.read",
		icon: PackageIcon,
	},
	{
		group: "Operations",
		label: "Kitchen",
		to: "/app/kitchen",
		permission: "prep.write",
		icon: ChefHatIcon,
	},
	{
		group: "Operations",
		label: "Leftovers",
		to: "/app/leftovers",
		permission: "leftover.write",
		icon: SoupIcon,
	},
	{
		group: "Marketplace",
		label: "My Listings",
		to: "/app/listings",
		permission: "",
		icon: TagIcon,
	},
	{
		group: "Marketplace",
		label: "Browse Surplus",
		to: "/app/market",
		permission: "",
		icon: ShoppingBasketIcon,
	},
	{
		group: "Insights",
		label: "Analytics",
		to: "/app/analytics",
		permission: "reports.read",
		icon: BarChart3Icon,
	},
	{
		group: "Insights",
		label: "Reports",
		to: "/app/reports",
		permission: "reports.read",
		icon: FileTextIcon,
	},
	{
		group: "Settings",
		label: "Catalog",
		to: "/app/catalog",
		permission: "inventory.read",
		icon: UtensilsCrossedIcon,
	},
	{
		group: "Settings",
		label: "Team",
		to: "/app/team",
		permission: "users.manage",
		icon: UsersIcon,
	},
	{
		group: "Settings",
		label: "Settings",
		to: "/app/settings",
		permission: "settings.write",
		icon: SettingsIcon,
	},
]

const NGO_NAV: NavItem[] = [
	{ group: "", label: "Available Food", to: "/ngo", permission: "", icon: ShoppingBasketIcon },
	{
		group: "",
		label: "My Pickups",
		to: "/ngo/pickups",
		permission: "listing.complete",
		icon: PackageIcon,
	},
	{
		group: "",
		label: "Organisation",
		to: "/ngo/organisation",
		permission: "settings.write",
		icon: BuildingIcon,
	},
	{ group: "", label: "Team", to: "/ngo/team", permission: "users.manage", icon: UsersIcon },
]

const ADMIN_NAV: NavItem[] = [
	{ group: "", label: "Tenants", to: "/admin", permission: "platform.analytics", icon: StoreIcon },
	{
		group: "",
		label: "Verification",
		to: "/admin/verification",
		permission: "ngo.verify",
		icon: ShieldCheckIcon,
	},
	{
		group: "",
		label: "Platform Analytics",
		to: "/admin/analytics",
		permission: "platform.analytics",
		icon: BarChart3Icon,
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
