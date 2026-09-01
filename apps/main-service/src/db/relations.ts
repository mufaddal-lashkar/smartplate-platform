import { relations } from "drizzle-orm"
import {
	dishes,
	dishIngredients,
	ingredients,
	jobRuns,
	leftoverDispositions,
	leftovers,
	listingEvents,
	listingItems,
	ngos,
	notifications,
	predictionScores,
	prepEntries,
	reports,
	restaurants,
	reuseConfirmations,
	suppliers,
	surplusListings,
	tenants,
	users,
} from "./schema"

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
	users: many(users),
	notifications: many(notifications),
	jobRuns: many(jobRuns),
	reports: many(reports),
	restaurant: one(restaurants),
	ngo: one(ngos),
}))

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
	tenant: one(tenants, { fields: [restaurants.tenantId], references: [tenants.id] }),
	predictionScores: many(predictionScores),
	reports: many(reports),
}))

export const predictionScoresRelations = relations(predictionScores, ({ one }) => ({
	tenant: one(tenants, { fields: [predictionScores.tenantId], references: [tenants.id] }),
	restaurant: one(restaurants, {
		fields: [predictionScores.restaurantId],
		references: [restaurants.id],
	}),
}))

export const ngosRelations = relations(ngos, ({ one }) => ({
	tenant: one(tenants, { fields: [ngos.tenantId], references: [tenants.id] }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
	tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
	notifications: many(notifications),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
	tenant: one(tenants, { fields: [notifications.tenantId], references: [tenants.id] }),
	user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))

export const jobRunsRelations = relations(jobRuns, ({ one }) => ({
	tenant: one(tenants, { fields: [jobRuns.tenantId], references: [tenants.id] }),
}))

export const dishesRelations = relations(dishes, ({ one, many }) => ({
	tenant: one(tenants, { fields: [dishes.tenantId], references: [tenants.id] }),
	restaurant: one(restaurants, { fields: [dishes.restaurantId], references: [restaurants.id] }),
	prepEntries: many(prepEntries),
	leftovers: many(leftovers),
}))

export const prepEntriesRelations = relations(prepEntries, ({ one, many }) => ({
	tenant: one(tenants, { fields: [prepEntries.tenantId], references: [tenants.id] }),
	dish: one(dishes, { fields: [prepEntries.dishId], references: [dishes.id] }),
	leftovers: many(leftovers),
}))

export const leftoversRelations = relations(leftovers, ({ one, many }) => ({
	tenant: one(tenants, { fields: [leftovers.tenantId], references: [tenants.id] }),
	dish: one(dishes, { fields: [leftovers.dishId], references: [dishes.id] }),
	prepEntry: one(prepEntries, { fields: [leftovers.prepEntryId], references: [prepEntries.id] }),
	disposition: one(leftoverDispositions),
	listingItems: many(listingItems),
}))

export const leftoverDispositionsRelations = relations(leftoverDispositions, ({ one }) => ({
	tenant: one(tenants, { fields: [leftoverDispositions.tenantId], references: [tenants.id] }),
	leftover: one(leftovers, {
		fields: [leftoverDispositions.leftoverId],
		references: [leftovers.id],
	}),
}))

export const surplusListingsRelations = relations(surplusListings, ({ one, many }) => ({
	tenant: one(tenants, { fields: [surplusListings.tenantId], references: [tenants.id] }),
	items: many(listingItems),
	events: many(listingEvents),
}))

export const listingItemsRelations = relations(listingItems, ({ one }) => ({
	listing: one(surplusListings, {
		fields: [listingItems.listingId],
		references: [surplusListings.id],
	}),
	leftover: one(leftovers, { fields: [listingItems.leftoverId], references: [leftovers.id] }),
}))

export const listingEventsRelations = relations(listingEvents, ({ one }) => ({
	listing: one(surplusListings, {
		fields: [listingEvents.listingId],
		references: [surplusListings.id],
	}),
}))

export const suppliersRelations = relations(suppliers, ({ one }) => ({
	tenant: one(tenants, { fields: [suppliers.tenantId], references: [tenants.id] }),
}))

export const dishIngredientsRelations = relations(dishIngredients, ({ one }) => ({
	tenant: one(tenants, { fields: [dishIngredients.tenantId], references: [tenants.id] }),
	dish: one(dishes, { fields: [dishIngredients.dishId], references: [dishes.id] }),
	ingredient: one(ingredients, {
		fields: [dishIngredients.ingredientId],
		references: [ingredients.id],
	}),
}))

export const reuseConfirmationsRelations = relations(reuseConfirmations, ({ one }) => ({
	tenant: one(tenants, { fields: [reuseConfirmations.tenantId], references: [tenants.id] }),
	leftover: one(leftovers, {
		fields: [reuseConfirmations.leftoverId],
		references: [leftovers.id],
	}),
	confirmedBy: one(users, {
		fields: [reuseConfirmations.confirmedByUserId],
		references: [users.id],
	}),
}))

export const reportsRelations = relations(reports, ({ one }) => ({
	tenant: one(tenants, { fields: [reports.tenantId], references: [tenants.id] }),
	restaurant: one(restaurants, {
		fields: [reports.restaurantId],
		references: [restaurants.id],
	}),
	requestedBy: one(users, {
		fields: [reports.requestedByUserId],
		references: [users.id],
	}),
}))
