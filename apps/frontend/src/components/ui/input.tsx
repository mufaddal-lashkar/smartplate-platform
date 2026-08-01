import type { ComponentProps } from "react"
import { cn } from "../../lib/utils"

export const Input = ({ className, type, ...props }: ComponentProps<"input">) => (
	<input
		type={type}
		className={cn(
			"flex h-10 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
			"placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
			"focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
			"aria-invalid:border-destructive aria-invalid:ring-destructive/20",
			"disabled:cursor-not-allowed disabled:opacity-50",
			className,
		)}
		{...props}
	/>
)
