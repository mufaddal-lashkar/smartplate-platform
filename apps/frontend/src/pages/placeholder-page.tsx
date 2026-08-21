import { Link } from "react-router"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

export const PlaceholderPage = ({ title, phase }: { title: string; phase: string }) => (
	<section className="w-full">
		<header className="flex items-center gap-3">
			<h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
			<Badge variant="secondary">{phase}</Badge>
		</header>

		<Card className="mt-8 border-dashed">
			<CardHeader>
				<CardTitle className="text-base">Not built yet</CardTitle>
				<CardDescription>
					The foundation this screen needs is in place. It arrives in {phase}.
				</CardDescription>
			</CardHeader>
		</Card>
	</section>
)

export const NotFoundPage = () => (
	<main className="flex min-h-screen items-center justify-center px-6">
		<Card className="w-full max-w-md text-center">
			<CardHeader>
				<CardTitle className="font-display text-xl">Page not found</CardTitle>
				<CardDescription>
					That page does not exist, or you do not have access to it.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button asChild variant="outline">
					<Link to="/">Back to your workspace</Link>
				</Button>
			</CardContent>
		</Card>
	</main>
)
