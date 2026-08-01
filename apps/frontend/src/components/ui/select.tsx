import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { cn } from "../../lib/utils"

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = ({
	className,
	children,
	...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) => (
	<SelectPrimitive.Trigger
		className={cn(
			"flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none",
			"data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
			"disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
			className,
		)}
		{...props}
	>
		{children}
		<SelectPrimitive.Icon asChild>
			<ChevronDownIcon className="size-4 opacity-50" />
		</SelectPrimitive.Icon>
	</SelectPrimitive.Trigger>
)

export const SelectContent = ({
	className,
	children,
	position = "popper",
	...props
}: ComponentProps<typeof SelectPrimitive.Content>) => (
	<SelectPrimitive.Portal>
		<SelectPrimitive.Content
			position={position}
			className={cn(
				"relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		>
			<SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
				<ChevronUpIcon className="size-4" />
			</SelectPrimitive.ScrollUpButton>
			<SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
			<SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
				<ChevronDownIcon className="size-4" />
			</SelectPrimitive.ScrollDownButton>
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
)

export const SelectItem = ({
	className,
	children,
	...props
}: ComponentProps<typeof SelectPrimitive.Item>) => (
	<SelectPrimitive.Item
		className={cn(
			"relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none",
			"focus:bg-secondary focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			className,
		)}
		{...props}
	>
		<span className="absolute right-2 flex size-3.5 items-center justify-center">
			<SelectPrimitive.ItemIndicator>
				<CheckIcon className="size-4" />
			</SelectPrimitive.ItemIndicator>
		</span>
		<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
	</SelectPrimitive.Item>
)

export const SelectLabel = ({
	className,
	...props
}: ComponentProps<typeof SelectPrimitive.Label>) => (
	<SelectPrimitive.Label
		className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
		{...props}
	/>
)

export const SelectSeparator = ({
	className,
	...props
}: ComponentProps<typeof SelectPrimitive.Separator>) => (
	<SelectPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
)
