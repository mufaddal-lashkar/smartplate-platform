import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { cn } from "../../lib/utils"

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = ({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) => (
	<DialogPrimitive.Overlay
		className={cn(
			"fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className,
		)}
		{...props}
	/>
)

export const DialogContent = ({
	className,
	children,
	...props
}: ComponentProps<typeof DialogPrimitive.Content>) => (
	<DialogPrimitive.Portal>
		<DialogOverlay />
		<DialogPrimitive.Content
			className={cn(
				"fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-background p-6 shadow-lg",
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		>
			{children}
			<DialogPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
				<XIcon className="size-4" />
				<span className="sr-only">Close</span>
			</DialogPrimitive.Close>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
)

export const DialogHeader = ({ className, ...props }: ComponentProps<"div">) => (
	<div className={cn("flex flex-col gap-2 text-center sm:text-left", className)} {...props} />
)

export const DialogFooter = ({ className, ...props }: ComponentProps<"div">) => (
	<div
		className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
		{...props}
	/>
)

export const DialogTitle = ({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Title>) => (
	<DialogPrimitive.Title
		className={cn("text-lg font-semibold leading-none", className)}
		{...props}
	/>
)

export const DialogDescription = ({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Description>) => (
	<DialogPrimitive.Description
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
)
