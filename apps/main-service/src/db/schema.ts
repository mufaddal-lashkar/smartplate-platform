import {
	index,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"

export const tenantType = pgEnum("tenant_type", ["restaurant", "ngo"])
export const userRole = pgEnum("user_role", [
	"super_admin",
	"owner",
	"staff",
	"ngo_admin",
	"ngo_volunteer",
])
export const tenantStatus = pgEnum("tenant_status", ["active", "suspended"])
export const notificationChannel = pgEnum("notification_channel", ["in_app", "email"])
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed"])

export const tenants = pgTable(
	"tenants",
	{
		id: uuid().primaryKey().defaultRandom(),
		type: tenantType().notNull(),
		name: text().notNull(),
		status: tenantStatus().notNull().default("active"),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("tenants_type_idx").on(t.type)],
)

export const restaurants = pgTable(
	"restaurants",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		name: text().notNull(),
		addressLine: text().notNull().default(""),
		city: text().notNull().default(""),
		state: text().notNull().default(""),
		pinCode: text().notNull().default(""),
		cuisineType: text().notNull().default(""),
		gstNumber: text().notNull().default(""),
		contactPhone: text().notNull().default(""),
		logoUrl: text().notNull().default(""),
		browseRadiusKm: numeric({ precision: 6, scale: 2 }).notNull().default("5"),
		latitude: numeric({ precision: 9, scale: 6 }),
		longitude: numeric({ precision: 9, scale: 6 }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("restaurants_tenant_idx").on(t.tenantId)],
)

export const ngos = pgTable(
	"ngos",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		name: text().notNull(),
		registrationNo: text().notNull().default(""),
		contactPhone: text().notNull().default(""),
		serviceRadiusKm: numeric({ precision: 6, scale: 2 }).notNull().default("10"),
		activeFrom: text().notNull().default("00:00"),
		activeTo: text().notNull().default("23:59"),
		verifiedAt: timestamp({ withTimezone: true }),
		latitude: numeric({ precision: 9, scale: 6 }),
		longitude: numeric({ precision: 9, scale: 6 }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("ngos_tenant_idx").on(t.tenantId)],
)

export const users = pgTable(
	"users",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid().references(() => tenants.id, { onDelete: "cascade" }),
		email: text().notNull(),
		passwordHash: text().notNull(),
		name: text().notNull(),
		role: userRole().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [uniqueIndex("users_email_key").on(t.email), index("users_tenant_idx").on(t.tenantId)],
)

export const emissionFactors = pgTable("emission_factors", {
	id: uuid().primaryKey().defaultRandom(),
	category: text().notNull().unique(),
	kgCo2ePerKg: numeric({ precision: 8, scale: 3 }).notNull(),
	source: text().notNull(),
})

export const notifications = pgTable(
	"notifications",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		userId: uuid().references(() => users.id, { onDelete: "cascade" }),
		channel: notificationChannel().notNull().default("in_app"),
		type: text().notNull(),
		payload: jsonb().notNull().default({}),
		readAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("notifications_tenant_created_idx").on(t.tenantId, t.createdAt)],
)

export const jobRuns = pgTable(
	"job_runs",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		jobType: text().notNull(),
		status: jobStatus().notNull().default("queued"),
		inputHash: text().notNull().default(""),
		error: text().notNull().default(""),
		startedAt: timestamp({ withTimezone: true }),
		finishedAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("job_runs_tenant_type_idx").on(t.tenantId, t.jobType)],
)

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Role = (typeof userRole.enumValues)[number]
export type TenantType = (typeof tenantType.enumValues)[number]
