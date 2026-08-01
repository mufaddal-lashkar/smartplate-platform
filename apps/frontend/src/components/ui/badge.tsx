import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
	"inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3",
	{
		variants: {
			variant: {
				default: "border-transparent bg-primary text-primary-foreground",
				secondary: "border-transparent bg-secondary text-secondary-foreground",
				outline: "text-foreground",
				good: "border-transparent bg-good/10 text-good",
				warning: "border-transparent bg-warning/15 text-serious",
				critical: "border-transparent bg-critical/10 text-critical",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
)

export type BadgeProps = ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & {
		asChild?: boolean
	}

export const Badge = ({ className, variant, asChild = false, ...props }: BadgeProps) => {
	const Comp = asChild === true ? Slot : "span"
	return <Comp className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
