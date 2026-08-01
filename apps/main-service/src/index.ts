import { Elysia } from "elysia"
import { authRoute } from "./modules/auth/auth.route"
import { eventsRoute } from "./modules/events/events.route"
import { healthRoute } from "./modules/health/health.route"
import { envelopePlugin } from "./shared/envelope.plugin"

const port = Number(process.env.PORT ?? 3000)

const app = new Elysia()
	.use(envelopePlugin)
	.use(healthRoute)
	.use(authRoute)
	.use(eventsRoute)
	.listen(port)

console.log(`main-service listening on :${port}`)

export type App = typeof app
