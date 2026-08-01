import { relations } from "drizzle-orm"
import { jobRuns, ngos, notifications, restaurants, tenants, users } from "./schema"

export const tenantsRelations = relations(tenants, ({ many, one }) => ({
	users: many(users),
	notifications: many(notifications),
	jobRuns: many(jobRuns),
	restaurant: one(restaurants),
	ngo: one(ngos),
}))

export const restaurantsRelations = relations(restaurants, ({ one }) => ({
	tenant: one(tenants, { fields: [restaurants.tenantId], references: [tenants.id] }),
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
