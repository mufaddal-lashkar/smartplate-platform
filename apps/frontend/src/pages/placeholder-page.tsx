export const PlaceholderPage = ({ title, phase }: { title: string; phase: string }) => (
	<section>
		<h1 className="text-lg font-semibold tracking-tight">{title}</h1>
		<div className="mt-4 rounded-lg border border-dashed border-border bg-card p-8 text-center">
			<p className="text-sm text-muted-foreground">Arrives in {phase}.</p>
			<p className="mt-1 text-xs text-subtle-foreground">
				The foundation is in place; this screen has not been built yet.
			</p>
		</div>
	</section>
)

export const NotFoundPage = () => (
	<section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
		<h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
		<p className="mt-2 text-sm text-muted-foreground">
			That page does not exist, or you do not have access to it.
		</p>
	</section>
)
