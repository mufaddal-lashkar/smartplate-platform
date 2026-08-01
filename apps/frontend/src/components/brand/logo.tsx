import { cn } from "../../lib/utils"

type LogoMarkProps = {
	className: string
	title: string
}

export const LogoMark = ({ className = "", title = "SmartPlate" }: Partial<LogoMarkProps>) => (
	<svg
		viewBox="0 0 32 32"
		role="img"
		aria-label={title}
		className={cn("size-8", className)}
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" opacity="0.35" />
		<rect x="8" y="10" width="16" height="3.2" rx="1.6" fill="currentColor" />
		<rect x="8" y="15.4" width="11" height="3.2" rx="1.6" fill="currentColor" opacity="0.75" />
		<rect x="8" y="20.8" width="6" height="3.2" rx="1.6" fill="currentColor" opacity="0.5" />
	</svg>
)

type LogoProps = {
	className: string
	markClassName: string
	wordClassName: string
}

export const Logo = ({
	className = "",
	markClassName = "",
	wordClassName = "",
}: Partial<LogoProps>) => (
	<span className={cn("inline-flex items-center gap-2.5", className)}>
		<LogoMark className={markClassName} />
		<span
			className={cn(
				"font-display text-[1.35rem] font-semibold leading-none tracking-tight",
				wordClassName,
			)}
		>
			SmartPlate
		</span>
	</span>
)
