import { Elysia } from "elysia"
import { getHealthReport } from "./health.service"

export const healthRoute = new Elysia().get("/v1/health", () => getHealthReport())
