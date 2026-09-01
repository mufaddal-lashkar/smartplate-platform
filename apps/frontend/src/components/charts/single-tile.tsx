import type { LucideIcon } from "lucide-react"
import { cn } from "../../lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"

export type SingleTileProps = {
	label: string
	value: string
	icon?: LucideIcon
	tone?: "default" | "good" | "warning" | "critical" | "serious"
	hint?: string
	footer?: React.ReactNode
}

const toneToClass: Record<NonNullable<SingleTileProps["tone"]>, string> = {
	default: "text-foreground",
	good: "text-good",
	warning: "text-warning",
	serious: "text-serious",
	critical: "text-critical",
}

export const SingleTile = ({
	label,
	value,
	icon: Icon,
	tone = "default",
	hint,
	footer,
}: SingleTileProps) => (
	<Card>
		<CardHeader>
			<div className="flex items-center gap-2">
				{Icon != null && <Icon className={cn("size-4", toneToClass[tone])} aria-hidden="true" />}
				<CardDescription>{label}</CardDescription>
			</div>
			<CardTitle className={cn("font-display text-3xl tabular", toneToClass[tone])}>
				{value}
			</CardTitle>
		</CardHeader>
		{(hint != null && hint !== "") || footer != null ? (
			<CardContent className="space-y-2">
				{hint != null && hint !== "" && <p className="text-xs text-muted-foreground">{hint}</p>}
				{footer}
			</CardContent>
		) : null}
	</Card>
)
