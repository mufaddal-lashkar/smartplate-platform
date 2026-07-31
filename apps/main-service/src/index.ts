import { Elysia } from "elysia"
import { healthRoute } from "./modules/health/health.route"
import { envelopePlugin } from "./shared/envelope.plugin"

const port = Number(process.env.PORT ?? 3000)

const app = new Elysia().use(envelopePlugin).use(healthRoute).listen(port)

console.log(`main-service listening on :${port}`)

export type App = typeof app
