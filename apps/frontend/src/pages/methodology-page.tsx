import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { cn } from "../lib/utils"

type Section = { id: string; title: string; body: string }

const SECTIONS: Section[] = [
	{
		id: "poore-nemecek-2018",
		title: "Poore & Némeck (2018)",
		body: "Default emission factors for cereals and most plant proteins. The 1 kg CO₂e per kg of food diverted is a multi-impact average from the 2018 Science paper covering acidification, eutrophication, land use and water stress, not just greenhouse gas emissions.",
	},
	{
		id: "landfill-methane",
		title: "Landfill methane (default for waste)",
		body: "When food reaches the bin, we treat the avoided CO₂e as the methane-equivalent that would have been released over the next 100 years in a typical Indian landfill. This number is the conservative bound — a wet landfill produces more.",
	},
]

const SLUGS: { id: string; title: string }[] = SECTIONS.map((s) => ({ id: s.id, title: s.title }))

export const MethodologyPage = () => {
	const [active, setActive] = useState<string>(SLUGS[0]?.id ?? "")

	useEffect(() => {
		const hash = window.location.hash.replace("#", "")
		if (hash !== "") setActive(hash)
		const handler = () => {
			const next = window.location.hash.replace("#", "")
			if (next !== "") setActive(next)
		}
		window.addEventListener("hashchange", handler)
		return () => window.removeEventListener("hashchange", handler)
	}, [])

	return (
		<section className="w-full">
			<header>
				<h1 className="font-display text-2xl font-semibold tracking-tight">Methodology</h1>
				<p className="mt-1 text-muted-foreground">
					How we calculate the kgCO₂e avoided number that appears on every chart.
				</p>
			</header>

			<div className="mt-6 grid gap-6 lg:grid-cols-[14rem_1fr]">
				<nav aria-label="Methodology sections" className="space-y-1">
					{SLUGS.map((s) => (
						<a
							key={s.id}
							href={`#${s.id}`}
							className={cn(
								"block rounded-md px-3 py-2 text-sm transition-colors",
								active === s.id
									? "bg-secondary font-medium text-secondary-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
						>
							{s.title}
						</a>
					))}
				</nav>

				<div className="space-y-6">
					{SECTIONS.map((s) => (
						<Card key={s.id} id={s.id} className="scroll-mt-8">
							<CardHeader>
								<CardTitle className="text-base">{s.title}</CardTitle>
								<CardDescription>Slug: {s.id}</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</section>
	)
}
