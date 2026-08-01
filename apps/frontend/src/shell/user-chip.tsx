import type { MeResponse } from "@smartplate/contracts/auth"
import { LogOutIcon } from "lucide-react"
import { useLogout } from "../auth/use-session"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import { cn } from "../lib/utils"

const initials = (name: string): string =>
	name
		.split(" ")
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("")

const readableRole = (role: string): string => role.replace(/_/g, " ")

type UserChipProps = {
	session: MeResponse
	collapsed: boolean
}

export const UserChip = ({ session, collapsed }: UserChipProps) => {
	const logout = useLogout()

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					"flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
					"hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
					collapsed && "justify-center px-0",
				)}
				aria-label={`Account menu for ${session.user.name}`}
			>
				<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
					{initials(session.user.name)}
				</span>
				{!collapsed && (
					<span className="min-w-0 flex-1">
						<span className="block truncate text-sm font-medium">{session.user.name}</span>
						<span className="block truncate text-xs capitalize text-muted-foreground">
							{readableRole(session.user.role)}
						</span>
					</span>
				)}
			</DropdownMenuTrigger>

			<DropdownMenuContent side="top" align="start" className="w-56">
				<DropdownMenuLabel>
					<span className="block truncate">{session.user.name}</span>
					<span className="block truncate text-xs font-normal text-muted-foreground">
						{session.user.email}
					</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => logout.mutate()}
					className="text-critical focus:text-critical"
				>
					<LogOutIcon />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
