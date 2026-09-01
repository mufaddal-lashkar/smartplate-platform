import { InfoIcon } from "lucide-react"
import { Link } from "react-router"
import { cn } from "../lib/utils"

export type CarbonMethodologyLinkProps = {
	slug: string
	className?: string
}

export const CarbonMethodologyLink = ({ slug, className }: CarbonMethodologyLinkProps) => (
	<Link
		to={`/app/methodology#${slug}`}
		className={cn(
			"inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
			className,
		)}
		title="Read the carbon methodology"
	>
		<InfoIcon className="size-3" aria-hidden="true" />
		<span>Methodology</span>
	</Link>
)
