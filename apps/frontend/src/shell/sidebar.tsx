import type { MeResponse } from "@smartplate/contracts/auth"
import { NavLink } from "react-router"
import { groupNavItems, navItemsFor } from "./nav-config"

const linkClass = ({ isActive }: { isActive: boolean }): string =>
	isActive
		? "block rounded-md px-3 py-2 text-sm font-medium bg-accent text-accent-foreground"
		: "block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-card hover:text-foreground"

export const Sidebar = ({ session }: { session: MeResponse }) => {
	const groups = groupNavItems(navItemsFor(session))

	return (
		<nav aria-label="Main" className="flex h-full flex-col gap-6 p-3">
			<div className="px-3 pt-2">
				<p className="text-sm font-semibold tracking-tight">SmartPlate</p>
				<p className="truncate text-xs text-subtle-foreground">{session.tenant.name}</p>
			</div>

			{groups.map((group) => (
				<div key={group.group || "root"} className="space-y-1">
					{group.group !== "" && group.items.length > 2 && (
						<p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-subtle-foreground">
							{group.group}
						</p>
					)}
					{group.items.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							end={item.to.split("/").length === 2}
							className={linkClass}
						>
							{item.label}
						</NavLink>
					))}
				</div>
			))}
		</nav>
	)
}
