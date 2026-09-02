import {
	boolean,
	date,
	index,
	integer,
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

export const ngoVerificationStatus = pgEnum("ngo_verification_status", [
	"pending",
	"approved",
	"rejected",
])

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
		verificationStatus: ngoVerificationStatus().notNull().default("pending"),
		verificationSubmittedAt: timestamp({ withTimezone: true }),
		verificationReviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		verificationReviewedAt: timestamp({ withTimezone: true }),
		rejectionReason: text().notNull().default(""),
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
		invitedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
		archivedAt: timestamp({ withTimezone: true }),
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

export const predictionScoreKind = ["reuse"] as const
export type PredictionScoreKind = (typeof predictionScoreKind)[number]

export const predictionScores = pgTable(
	"prediction_scores",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		kind: text().$type<PredictionScoreKind>().notNull(),
		periodStart: date().notNull(),
		periodEnd: date().notNull(),
		predictedValue: numeric({ precision: 12, scale: 3 }).notNull(),
		actualValue: numeric({ precision: 12, scale: 3 }).notNull(),
		absError: numeric({ precision: 12, scale: 3 }).notNull(),
		model: text().notNull(),
		promptVersion: text().notNull().default(""),
		source: text().notNull().default("model"),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("prediction_scores_tenant_idx").on(t.tenantId, t.kind, t.periodEnd),
		index("prediction_scores_period_idx").on(t.periodEnd),
	],
)

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Role = (typeof userRole.enumValues)[number]
export type TenantType = (typeof tenantType.enumValues)[number]

export const servingUnit = pgEnum("serving_unit", ["kg", "plate", "piece", "litre"])
export const storageMethod = pgEnum("storage_method", ["room_temp", "refrigerated", "frozen"])
export const listingChannel = pgEnum("listing_channel", ["b2b", "ngo"])
export const listingStatus = pgEnum("listing_status", [
	"open",
	"claimed",
	"completed",
	"expired",
	"cancelled",
])
export const leftoverStatus = pgEnum("leftover_status", [
	"pending_disposition",
	"awaiting_reuse",
	"closed",
])

export const ingredients = pgTable(
	"ingredients",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		name: text().notNull(),
		category: text().notNull(),
		baseUnit: text().notNull().default("g"),
		pieceWeightG: numeric({ precision: 10, scale: 2 }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [uniqueIndex("ingredients_tenant_name_key").on(t.tenantId, t.name)],
)

export const dishes = pgTable(
	"dishes",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		name: text().notNull(),
		category: text().notNull().default(""),
		servingUnit: servingUnit().notNull().default("kg"),
		avgServingWeightG: numeric({ precision: 10, scale: 2 }),
		sellingPrice: numeric({ precision: 10, scale: 2 }).notNull().default("0"),
		costPerUnit: numeric({ precision: 10, scale: 2 }).notNull().default("0"),
		shelfLifeHours: integer().notNull().default(24),
		isReusable: boolean().notNull().default(true),
		reuseRoute: text().notNull().default(""),
		archivedAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("dishes_tenant_idx").on(t.tenantId, t.restaurantId)],
)

export const inventoryLots = pgTable(
	"inventory_lots",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		ingredientId: uuid()
			.notNull()
			.references(() => ingredients.id, { onDelete: "cascade" }),
		qtyPurchasedBase: numeric({ precision: 12, scale: 3 }).notNull(),
		qtyRemainingBase: numeric({ precision: 12, scale: 3 }).notNull(),
		unitCost: numeric({ precision: 10, scale: 4 }).notNull(),
		purchaseDate: date().notNull(),
		expiryDate: date(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("inventory_lots_pick_idx").on(t.tenantId, t.ingredientId, t.expiryDate)],
)

export const inventoryMovements = pgTable(
	"inventory_movements",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		lotId: uuid().references(() => inventoryLots.id, { onDelete: "cascade" }),
		ingredientId: uuid()
			.notNull()
			.references(() => ingredients.id, { onDelete: "cascade" }),
		qtyDeltaBase: numeric({ precision: 12, scale: 3 }).notNull(),
		reason: text().notNull(),
		occurredAt: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [index("inventory_movements_series_idx").on(t.tenantId, t.ingredientId, t.occurredAt)],
)

export const prepEntries = pgTable(
	"prep_entries",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		dishId: uuid()
			.notNull()
			.references(() => dishes.id, { onDelete: "cascade" }),
		serviceDate: date().notNull(),
		mealPeriod: text().notNull(),
		qtyPrepared: numeric({ precision: 12, scale: 3 }).notNull(),
		qtyServed: numeric({ precision: 12, scale: 3 }).notNull().default("0"),
		covers: integer(),
		preparedAt: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [index("prep_entries_service_idx").on(t.tenantId, t.serviceDate, t.mealPeriod)],
)

export const leftovers = pgTable(
	"leftovers",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		dishId: uuid()
			.notNull()
			.references(() => dishes.id, { onDelete: "cascade" }),
		prepEntryId: uuid().references(() => prepEntries.id, { onDelete: "set null" }),
		serviceDate: date().notNull(),
		qty: numeric({ precision: 12, scale: 3 }).notNull(),
		unit: servingUnit().notNull(),
		storage: storageMethod().notNull().default("room_temp"),
		preparedAt: timestamp({ withTimezone: true }).notNull(),
		safeUntil: timestamp({ withTimezone: true }).notNull(),
		status: leftoverStatus().notNull().default("pending_disposition"),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("leftovers_service_idx").on(t.tenantId, t.serviceDate),
		index("leftovers_status_idx").on(t.tenantId, t.status),
	],
)

export const leftoverDispositions = pgTable(
	"leftover_dispositions",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		leftoverId: uuid()
			.notNull()
			.references(() => leftovers.id, { onDelete: "cascade" }),
		retainQty: numeric({ precision: 12, scale: 3 }).notNull().default("0"),
		sellQty: numeric({ precision: 12, scale: 3 }).notNull().default("0"),
		donateQty: numeric({ precision: 12, scale: 3 }).notNull().default("0"),
		wasteQty: numeric({ precision: 12, scale: 3 }).notNull().default("0"),
		sellPricePerUnit: numeric({ precision: 10, scale: 2 }).notNull().default("0"),
		aiSuggestedRetainQty: numeric({ precision: 12, scale: 3 }).notNull().default("0"),
		decidedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
		decidedAt: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [uniqueIndex("leftover_dispositions_leftover_key").on(t.leftoverId)],
)

export const surplusListings = pgTable(
	"surplus_listings",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		channel: listingChannel().notNull(),
		status: listingStatus().notNull().default("open"),
		qty: numeric({ precision: 12, scale: 3 }).notNull(),
		unit: servingUnit().notNull(),
		pricePerUnit: numeric({ precision: 10, scale: 2 }).notNull().default("0"),
		pickupFrom: timestamp({ withTimezone: true }).notNull(),
		pickupUntil: timestamp({ withTimezone: true }).notNull(),
		safeUntil: timestamp({ withTimezone: true }).notNull(),
		escalateAt: timestamp({ withTimezone: true }),
		claimedByTenantId: uuid().references(() => tenants.id, { onDelete: "set null" }),
		claimedAt: timestamp({ withTimezone: true }),
		completedAt: timestamp({ withTimezone: true }),
		latitude: numeric({ precision: 9, scale: 6 }),
		longitude: numeric({ precision: 9, scale: 6 }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("surplus_listings_open_idx").on(t.status, t.channel, t.pickupUntil),
		index("surplus_listings_escalate_idx").on(t.escalateAt),
	],
)

export const listingItems = pgTable("listing_items", {
	id: uuid().primaryKey().defaultRandom(),
	tenantId: uuid()
		.notNull()
		.references(() => tenants.id, { onDelete: "cascade" }),
	listingId: uuid()
		.notNull()
		.references(() => surplusListings.id, { onDelete: "cascade" }),
	leftoverId: uuid()
		.notNull()
		.references(() => leftovers.id, { onDelete: "cascade" }),
	qty: numeric({ precision: 12, scale: 3 }).notNull(),
})

export const listingEvents = pgTable(
	"listing_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		listingId: uuid()
			.notNull()
			.references(() => surplusListings.id, { onDelete: "cascade" }),
		event: text().notNull(),
		detail: text().notNull().default(""),
		occurredAt: timestamp({ withTimezone: true }).notNull(),
	},
	(t) => [index("listing_events_listing_idx").on(t.listingId, t.occurredAt)],
)

export const predictions = pgTable(
	"predictions",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		targetRef: text().notNull().default(""),
		payload: jsonb().notNull().default({}),
		model: text().notNull(),
		promptVersion: text().notNull().default(""),
		source: text().notNull().default("model"),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("predictions_tenant_kind_idx").on(t.tenantId, t.kind, t.createdAt)],
)

export const suppliers = pgTable(
	"suppliers",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		name: text().notNull(),
		contactName: text().notNull().default(""),
		contactPhone: text().notNull().default(""),
		contactEmail: text().notNull().default(""),
		addressLine: text().notNull().default(""),
		archivedAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("suppliers_tenant_idx").on(t.tenantId)],
)

export const dishIngredients = pgTable(
	"dish_ingredients",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		dishId: uuid()
			.notNull()
			.references(() => dishes.id, { onDelete: "cascade" }),
		ingredientId: uuid()
			.notNull()
			.references(() => ingredients.id, { onDelete: "cascade" }),
		qtyPerServing: numeric({ precision: 10, scale: 3 }).notNull(),
		unit: text().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("dish_ingredients_dish_idx").on(t.tenantId, t.dishId),
		uniqueIndex("dish_ingredients_unique").on(t.dishId, t.ingredientId),
	],
)

export const reuseConfirmations = pgTable(
	"reuse_confirmations",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		leftoverId: uuid()
			.notNull()
			.references(() => leftovers.id, { onDelete: "cascade" }),
		confirmedReusedQty: numeric({ precision: 12, scale: 3 }).notNull(),
		confirmedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
		notes: text().notNull().default(""),
		confirmedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("reuse_confirmations_tenant_idx").on(t.tenantId, t.leftoverId)],
)

export const reportStatuses = ["queued", "running", "succeeded", "failed"] as const
export type ReportStatus = (typeof reportStatuses)[number]

export const reports = pgTable(
	"reports",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		reportType: text().notNull(),
		periodStart: date().notNull(),
		periodEnd: date().notNull(),
		format: text().notNull(),
		artifactPath: text().notNull().default(""),
		status: text().$type<ReportStatus>().notNull().default("queued"),
		error: text().notNull().default(""),
		requestedByUserId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		finishedAt: timestamp({ withTimezone: true }),
	},
	(t) => [index("reports_tenant_idx").on(t.tenantId, t.createdAt)],
)

export const userPermissions = pgTable(
	"user_permissions",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		permission: text().notNull(),
		granted: boolean().notNull(),
		updatedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [uniqueIndex("user_permissions_user_perm_key").on(t.tenantId, t.userId, t.permission)],
)

export const auditLogs = pgTable(
	"audit_logs",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		actorId: uuid().references(() => users.id, { onDelete: "set null" }),
		action: text().notNull(),
		entityType: text().notNull(),
		entityId: text().notNull(),
		payload: jsonb().notNull().default({}),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
		index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
	],
)

export const notificationPreferences = pgTable(
	"notification_preferences",
	{
		id: uuid().primaryKey().defaultRandom(),
		tenantId: uuid()
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		topic: text().notNull(),
		radiusKm: numeric({ precision: 6, scale: 2 }),
		activeFrom: text().notNull().default("00:00"),
		activeTo: text().notNull().default("23:59"),
		quietHoursEnabled: boolean().notNull().default(false),
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [uniqueIndex("notification_preferences_user_topic_key").on(t.tenantId, t.userId, t.topic)],
)

export type UserPermission = typeof userPermissions.$inferSelect
export type AuditLog = typeof auditLogs.$inferSelect
export type NotificationPreference = typeof notificationPreferences.$inferSelect
export type NgoVerificationStatusValue = (typeof ngoVerificationStatus.enumValues)[number]

export type Dish = typeof dishes.$inferSelect
export type NewDish = typeof dishes.$inferInsert
export type Leftover = typeof leftovers.$inferSelect
export type NewLeftover = typeof leftovers.$inferInsert
export type SurplusListing = typeof surplusListings.$inferSelect
export type ServingUnit = (typeof servingUnit.enumValues)[number]
export type StorageMethod = (typeof storageMethod.enumValues)[number]
export type ListingChannel = (typeof listingChannel.enumValues)[number]
