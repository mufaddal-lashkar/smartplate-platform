import type { ComponentProps } from "react"
import { cn } from "../../lib/utils"

export const Card = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		className={cn(
			"flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
			className,
		)}
		{...props}
	/>
)

export const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("flex flex-col gap-1.5 px-6", className)} {...props} />
)

export const CardTitle = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
)

export const CardDescription = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("text-sm text-muted-foreground", className)} {...props} />
)

export const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("px-6", className)} {...props} />
)

export const CardFooter = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("flex items-center px-6", className)} {...props} />
)
