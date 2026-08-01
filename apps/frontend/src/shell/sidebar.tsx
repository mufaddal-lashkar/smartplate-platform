import type { MeResponse } from "@smartplate/contracts/auth"
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react"
import { NavLink } from "react-router"
import { LogoMark } from "../components/brand/logo"
import { cn } from "../lib/utils"
import { groupNavItems, navItemsFor } from "./nav-config"
import { UserChip } from "./user-chip"

type SidebarProps = {
	session: MeResponse
	collapsed: boolean
	onToggle: () => void
}

export const Sidebar = ({ session, collapsed, onToggle }: SidebarProps) => {
	const groups = groupNavItems(navItemsFor(session))

	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			<div
				className={cn("flex items-center gap-2.5 px-4 py-4", collapsed && "justify-center px-0")}
			>
				<LogoMark className="size-7 shrink-0 text-primary" />
				{!collapsed && (
					<span className="font-display text-lg font-semibold leading-none tracking-tight">
						SmartPlate
					</span>
				)}
			</div>

			<nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
				{groups.map((group) => (
					<div key={group.group || "root"} className="space-y-1">
						{group.group !== "" && group.items.length > 2 && !collapsed && (
							<p className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								{group.group}
							</p>
						)}
						{group.items.map((item) => {
							const Icon = item.icon
							return (
								<NavLink
									key={item.to}
									to={item.to}
									end={item.to.split("/").length === 2}
									title={collapsed ? item.label : undefined}
									className={({ isActive }) =>
										cn(
											"flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
											collapsed && "justify-center px-0",
											isActive
												? "bg-secondary font-medium text-secondary-foreground"
												: "text-muted-foreground hover:bg-muted hover:text-foreground",
										)
									}
								>
									<Icon className="size-4 shrink-0" aria-hidden="true" />
									{!collapsed && <span className="truncate">{item.label}</span>}
								</NavLink>
							)
						})}
					</div>
				))}
			</nav>

			<div className="border-t border-sidebar-border p-3">
				<button
					type="button"
					onClick={onToggle}
					aria-expanded={!collapsed}
					aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
					className={cn(
						"mb-2 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors",
						"hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
						collapsed && "justify-center px-0",
					)}
				>
					{collapsed ? (
						<PanelLeftOpenIcon className="size-4 shrink-0" />
					) : (
						<PanelLeftCloseIcon className="size-4 shrink-0" />
					)}
					{!collapsed && <span>Collapse</span>}
				</button>

				<UserChip session={session} collapsed={collapsed} />
			</div>
		</div>
	)
}
