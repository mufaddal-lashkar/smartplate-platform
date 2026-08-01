import type { ReactNode } from "react"
import { Logo } from "../components/brand/logo"
import { BrandPanel } from "./brand-panel"

type AuthLayoutProps = {
	title: string
	subtitle: string
	children: ReactNode
	footer: ReactNode
}

export const AuthLayout = ({ title, subtitle, children, footer }: AuthLayoutProps) => (
	<div className="h-dvh overflow-hidden lg:grid lg:grid-cols-[60fr_40fr]">
		<div className="hidden h-dvh lg:block">
			<BrandPanel />
		</div>

		<main className="flex h-dvh flex-col justify-center overflow-y-auto px-6 py-10 sm:px-10 lg:px-14">
			<div className="mx-auto w-full max-w-sm">
				<Logo className="mb-8 text-primary lg:hidden" />

				<h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
				<p className="mt-2 text-muted-foreground">{subtitle}</p>

				<div className="mt-7">{children}</div>

				<div className="mt-7 text-sm text-muted-foreground">{footer}</div>
			</div>
		</main>
	</div>
)
