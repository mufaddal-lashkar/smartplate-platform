import { LogoMark } from "../components/brand/logo"

const ORB = "absolute rounded-full blur-[70px]"
const RIPPLE =
	"absolute top-1/2 left-1/2 size-88 -mt-44 -ml-44 rounded-full border border-green-300 opacity-0 animate-ripple-out"

export const BrandPanel = () => (
	<section className="relative h-full overflow-hidden bg-brand-gradient">
		<div className="pointer-events-none absolute inset-0" aria-hidden="true">
			<span
				className={`${ORB} -top-32 -left-24 size-136 bg-radial from-green-500 to-transparent to-68% opacity-50 animate-drift-a`}
			/>
			<span
				className={`${ORB} -right-28 -bottom-20 size-112 bg-radial from-green-600 to-transparent to-68% opacity-50 animate-drift-b`}
			/>
			<span
				className={`${ORB} top-[45%] left-[55%] size-88 bg-radial from-green-400 to-transparent to-70% opacity-30 animate-drift-c`}
			/>

			<span className={RIPPLE} />
			<span className={`${RIPPLE} [animation-delay:3s]`} />
			<span className={`${RIPPLE} [animation-delay:6s]`} />

			<span className="absolute inset-0 bg-grain opacity-15" />
		</div>

		<div className="relative flex h-full flex-col items-center justify-center px-12 text-center">
			<LogoMark className="size-14 text-green-300" />

			<h1 className="mt-7 font-display text-5xl font-semibold tracking-tight text-white xl:text-6xl">
				SmartPlate <span className="text-green-300">AI</span>
			</h1>

			<p className="mt-5 max-w-sm text-lg leading-relaxed text-green-100/80">
				Every plate accounted for. Reuse it, sell it, share it — before it ever becomes waste.
			</p>
		</div>
	</section>
)
