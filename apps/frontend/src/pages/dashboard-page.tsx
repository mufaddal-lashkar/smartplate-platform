import { useSession } from "../auth/use-session"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

const RATES = [
	{ label: "Recovery rate", hint: "surplus that avoided the bin" },
	{ label: "Surplus rate", hint: "of what you prepared" },
	{ label: "Waste rate", hint: "what actually got binned" },
]

export const DashboardPage = () => {
	const { session } = useSession()

	return (
		<section className="mx-auto max-w-5xl">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">
					Good evening, {session?.user.name.split(" ")[0]}
				</h1>
				<p className="mt-1 text-muted-foreground">{session?.tenant.name}</p>
			</header>

			<div className="mt-8 grid gap-4 sm:grid-cols-3">
				{RATES.map((rate) => (
					<Card key={rate.label}>
						<CardHeader>
							<CardDescription>{rate.label}</CardDescription>
							<CardTitle className="font-display text-3xl tabular text-muted-foreground">
								—
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-xs text-muted-foreground">{rate.hint}</p>
						</CardContent>
					</Card>
				))}
			</div>

			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="text-base">Nothing to measure yet</CardTitle>
					<CardDescription>
						These fill in once you have recorded a couple of weeks of inventory, prep and leftovers.
						Metrics arrive in P7.
					</CardDescription>
				</CardHeader>
			</Card>
		</section>
	)
}
