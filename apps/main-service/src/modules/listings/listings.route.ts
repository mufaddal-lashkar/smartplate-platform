import type { Collection } from "@smartplate/contracts/envelope"
import { Elysia } from "elysia"
import { requirePermission } from "../../shared/rbac"
import { requireSession, sessionPlugin } from "../../shared/session.plugin"
import type { ListingWithEvents } from "./listings.queries"
import { listListings } from "./listings.service"

export const listingsRoute = new Elysia()
	.use(sessionPlugin)
	.get("/v1/listings", async ({ session }): Promise<Collection<ListingWithEvents>> => {
		const active = requireSession(session)
		requirePermission(active, "reports.read")
		return { items: await listListings(active), nextCursor: "" }
	})
