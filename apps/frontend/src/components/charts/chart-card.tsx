import type { ReactNode } from "react"
import { CarbonMethodologyLink } from "../carbon-methodology-link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card"

export type ChartCardProps = {
	title: string
	description?: string
	methodologySlug?: string
	children: ReactNode
	footer?: ReactNode
}

export const ChartCard = ({
	title,
	description,
	methodologySlug,
	children,
	footer,
}: ChartCardProps) => (
	<Card>
		<CardHeader>
			<div className="flex items-start justify-between gap-3">
				<div>
					<CardTitle className="text-base">{title}</CardTitle>
					{description != null && description !== "" && (
						<CardDescription className="mt-1">{description}</CardDescription>
					)}
				</div>
				{methodologySlug != null && methodologySlug !== "" && (
					<CarbonMethodologyLink slug={methodologySlug} />
				)}
			</div>
		</CardHeader>
		<CardContent>
			{children}
			{footer != null && <div className="mt-3">{footer}</div>}
		</CardContent>
	</Card>
)
