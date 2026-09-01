import type { LucideIcon } from "lucide-react"
import { cn } from "../../lib/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"

export type Kpi = {
	label: string
	value: string
	icon?: LucideIcon
	tone?: "default" | "good" | "warning" | "critical" | "serious"
	hint?: string
}

export type KpiGridProps = {
	items: Kpi[]
	columns?: 2 | 3 | 4
}

const toneClass: Record<NonNullable<Kpi["tone"]>, string> = {
	default: "text-foreground",
	good: "text-good",
	warning: "text-warning",
	serious: "text-serious",
	critical: "text-critical",
}

const gridClass = (cols: KpiGridProps["columns"]): string => {
	if (cols === 2) return "grid gap-4 sm:grid-cols-2"
	if (cols === 4) return "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
	return "grid gap-4 sm:grid-cols-3"
}

export const KpiGrid = ({ items, columns = 3 }: KpiGridProps) => (
	<div className={gridClass(columns)}>
		{items.map((kpi) => {
			const Icon = kpi.icon
			const tone = kpi.tone ?? "default"
			return (
				<Card key={kpi.label}>
					<CardHeader>
						<div className="flex items-center gap-2">
							{Icon != null && (
								<Icon className={cn("size-4", toneClass[tone])} aria-hidden="true" />
							)}
							<CardDescription>{kpi.label}</CardDescription>
						</div>
						<CardTitle className={cn("font-display text-2xl tabular", toneClass[tone])}>
							{kpi.value}
						</CardTitle>
					</CardHeader>
					{kpi.hint != null && kpi.hint !== "" && (
						<CardContent>
							<p className="text-xs text-muted-foreground">{kpi.hint}</p>
						</CardContent>
					)}
				</Card>
			)
		})}
	</div>
)
