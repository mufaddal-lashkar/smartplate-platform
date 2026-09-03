import type { RoleValue, TenantTypeValue } from "./auth"

export type IntentTier = "core" | "shallow" | "out_of_tier"

export type ParamAdapterKind = "date-range" | "date" | "dish" | "enum" | "unit" | "raw"

export type ParamAdapterSpec = {
	name: string
	kind: ParamAdapterKind
	required: boolean
	options?: string[]
}

export const DESTRUCTIVE_CONFIRM_REQUIRED = new Set<string>([
	"leftovers.dispositions",
	"listings.cancel",
	"listings.no_show",
	"sessions.revoke",
	"users.archive",
	"auth.logout",
	"market.release",
	"admin.verification.decide",
	"leftovers.disposition_suggest",
])

export type IntentSpec = {
	intent: string
	tier: IntentTier
	tenantTypes: TenantTypeValue[]
	roles: RoleValue[]
	requiredEntities: string[]
	example: string
	listIntent: string
	menuSection: string
	buttonLabel: string
	command: string
	destructive: boolean
	requiresConfirmation: boolean
	paramAdapters: ParamAdapterSpec[]
}

type IntentOverrides = Partial<Omit<IntentSpec, "intent" | "tier" | "tenantTypes" | "roles">>

const ALL: RoleValue[] = ["super_admin", "owner", "staff", "ngo_admin", "ngo_volunteer"]
const TENANT_ROLES: RoleValue[] = ["owner", "staff", "ngo_admin", "ngo_volunteer"]
const OWNER_STAFF: RoleValue[] = ["owner", "staff"]
const OWNER: RoleValue[] = ["owner"]
const OWNER_ADMIN: RoleValue[] = ["owner", "ngo_admin"]
const NGO_BOTH: RoleValue[] = ["ngo_admin", "ngo_volunteer"]
const NGO_ADMIN: RoleValue[] = ["ngo_admin"]
const SUPER: RoleValue[] = ["super_admin"]

const BOTH: TenantTypeValue[] = ["restaurant", "ngo"]
const RESTAURANT: TenantTypeValue[] = ["restaurant"]
const NGO: TenantTypeValue[] = ["ngo"]

const spec = (
	intent: string,
	tier: IntentTier,
	tenantTypes: TenantTypeValue[],
	roles: RoleValue[],
	overrides: IntentOverrides,
): IntentSpec => ({
	intent,
	tier,
	tenantTypes,
	roles,
	requiredEntities: overrides.requiredEntities ?? [],
	example: overrides.example ?? "",
	listIntent: overrides.listIntent ?? "",
	menuSection: overrides.menuSection ?? "",
	buttonLabel: overrides.buttonLabel ?? "",
	command: overrides.command ?? "",
	destructive: overrides.destructive ?? false,
	requiresConfirmation: DESTRUCTIVE_CONFIRM_REQUIRED.has(intent),
	paramAdapters: [],
})

export const INTENTS: IntentSpec[] = [
	spec("auth.me", "shallow", BOTH, TENANT_ROLES, {
		menuSection: "Settings",
		buttonLabel: "Who am I",
	}),
	spec("auth.logout", "shallow", BOTH, TENANT_ROLES, {
		menuSection: "Settings",
		buttonLabel: "Unlink chat",
		destructive: true,
	}),
	spec("sessions.list", "shallow", BOTH, OWNER_ADMIN, {
		menuSection: "Settings",
		buttonLabel: "Active sessions",
	}),
	spec("sessions.revoke", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["family"],
		listIntent: "sessions.list",
		destructive: true,
	}),

	spec("inventory.stock", "core", RESTAURANT, OWNER_STAFF, {
		menuSection: "Kitchen",
		buttonLabel: "Stock",
		command: "stock",
	}),
	spec("inventory.expiring", "core", RESTAURANT, OWNER_STAFF, {
		menuSection: "Kitchen",
		buttonLabel: "Expiring soon",
		command: "expiring",
	}),
	spec("inventory.purchases.create", "core", RESTAURANT, OWNER_STAFF, {
		requiredEntities: ["ingredient", "qty"],
		example: "bought 3 kg of basmati rice",
	}),
	spec("inventory.adjustments.create", "core", RESTAURANT, OWNER_STAFF, {
		requiredEntities: ["ingredient", "qty"],
		example: "spilled 2 kg of basmati rice",
	}),

	spec("prep.create", "core", RESTAURANT, OWNER_STAFF, {
		requiredEntities: ["dish", "qty"],
		example: "prepped 20 plates of paneer butter masala for lunch",
	}),
	spec("prep.reuse_pending", "core", RESTAURANT, OWNER, {
		menuSection: "Kitchen",
		buttonLabel: "Reuse pending",
	}),
	spec("prep.reuse_confirm", "core", RESTAURANT, OWNER, {
		requiredEntities: ["leftoverId", "reusedQty"],
		listIntent: "prep.reuse_pending",
	}),

	spec("leftovers.list", "core", RESTAURANT, OWNER_STAFF, {
		menuSection: "Kitchen",
		buttonLabel: "Leftovers",
		command: "leftovers",
	}),
	spec("leftovers.record", "core", RESTAURANT, OWNER_STAFF, {
		requiredEntities: ["dish", "qty"],
		example: "leftover 4 plates of paneer butter masala",
	}),
	spec("leftovers.disposition_suggest", "core", RESTAURANT, OWNER, {
		requiredEntities: ["leftoverId"],
		listIntent: "leftovers.list",
	}),
	spec("leftovers.dispositions", "core", RESTAURANT, OWNER, {
		requiredEntities: ["dispositions"],
		listIntent: "leftovers.list",
	}),

	spec("listings.own", "core", RESTAURANT, OWNER_STAFF, {
		menuSection: "Market",
		buttonLabel: "My listings",
		command: "listings",
	}),
	spec("listings.patch", "core", RESTAURANT, OWNER, {
		requiredEntities: ["listingId", "pricePerUnit"],
		listIntent: "listings.own",
	}),
	spec("listings.cancel", "core", RESTAURANT, OWNER, {
		requiredEntities: ["listingId"],
		listIntent: "listings.own",
		buttonLabel: "Cancel listing",
		destructive: true,
	}),
	spec("listings.complete", "core", BOTH, TENANT_ROLES, {
		requiredEntities: ["listingId"],
		listIntent: "listings.own",
	}),
	spec("listings.no_show", "core", RESTAURANT, OWNER_STAFF, {
		requiredEntities: ["listingId"],
		listIntent: "listings.own",
		buttonLabel: "Report no-show",
		destructive: true,
	}),

	spec("market.browse", "core", BOTH, TENANT_ROLES, {
		menuSection: "Market",
		buttonLabel: "Browse market",
		command: "market",
	}),
	spec("market.mine", "core", BOTH, OWNER_ADMIN, {
		menuSection: "Market",
		buttonLabel: "My claims",
	}),
	spec("market.claim", "core", BOTH, OWNER_ADMIN, {
		requiredEntities: ["listingId"],
		listIntent: "market.browse",
	}),
	spec("market.release", "core", BOTH, OWNER_ADMIN, {
		requiredEntities: ["listingId"],
		listIntent: "market.mine",
		buttonLabel: "Release claim",
		destructive: true,
	}),
	spec("market.pickups", "core", NGO, NGO_BOTH, {
		menuSection: "Market",
		buttonLabel: "Pickups",
		command: "pickups",
	}),

	spec("analytics.dashboard", "core", BOTH, OWNER_ADMIN, {
		menuSection: "Insights",
		buttonLabel: "Dashboard",
		command: "dashboard",
	}),
	spec("analytics.waste", "core", RESTAURANT, OWNER, {
		menuSection: "Insights",
		buttonLabel: "Waste trend",
	}),
	spec("analytics.recovery", "core", RESTAURANT, OWNER, {
		menuSection: "Insights",
		buttonLabel: "Recovery trend",
	}),
	spec("analytics.dishes", "core", RESTAURANT, OWNER, {
		menuSection: "Insights",
		buttonLabel: "Dish performance",
	}),
	spec("analytics.forecasts", "core", RESTAURANT, OWNER, {
		menuSection: "Insights",
		buttonLabel: "Forecasts",
	}),
	spec("insights.get", "core", RESTAURANT, OWNER, {
		menuSection: "Insights",
		buttonLabel: "AI insights",
	}),

	spec("reports.create", "core", BOTH, OWNER_ADMIN, {
		menuSection: "Insights",
		buttonLabel: "Generate report",
		command: "report",
	}),
	spec("reports.list", "core", BOTH, OWNER_ADMIN, {
		menuSection: "Insights",
		buttonLabel: "My reports",
	}),
	spec("reports.download", "core", BOTH, OWNER_ADMIN, {
		requiredEntities: ["reportId"],
		listIntent: "reports.list",
	}),

	spec("tenant.get", "shallow", BOTH, OWNER_ADMIN, {
		menuSection: "Settings",
		buttonLabel: "Organisation",
	}),
	spec("tenant.update", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["name"],
		example: "rename the organisation to Spice Route Kitchens",
	}),
	spec("restaurant.get", "shallow", RESTAURANT, OWNER_STAFF, {
		menuSection: "Settings",
		buttonLabel: "Restaurant profile",
	}),
	spec("restaurant.update", "shallow", RESTAURANT, OWNER, {
		requiredEntities: ["name"],
		example: "set the restaurant city to Bengaluru",
	}),
	spec("ngo.get", "shallow", NGO, NGO_BOTH, {
		menuSection: "Settings",
		buttonLabel: "NGO profile",
	}),
	spec("ngo.update", "shallow", NGO, NGO_ADMIN, {
		requiredEntities: ["name"],
		example: "set NGO active hours 06:00 to 22:00",
	}),
	spec("ngo.verification.submit", "shallow", NGO, NGO_ADMIN, {
		requiredEntities: ["registrationNo", "contactName", "contactPhone"],
		example: "verify my ngo, registration REG-AKS-001, contact Ravi Kumar, phone +91-9000000001",
		menuSection: "Settings",
		buttonLabel: "Submit verification",
	}),

	spec("users.list", "shallow", BOTH, OWNER_ADMIN, {
		menuSection: "Team",
		buttonLabel: "Team",
		command: "team",
	}),
	spec("users.invite", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["email", "name", "role"],
		example: "invite priya@spiceroute.local as staff, name Priya",
		menuSection: "Team",
		buttonLabel: "Invite",
	}),
	spec("users.update", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["userId"],
		listIntent: "users.list",
	}),
	spec("users.archive", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["userId"],
		listIntent: "users.list",
		buttonLabel: "Archive",
		destructive: true,
	}),
	spec("permissions.list", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["userId"],
		listIntent: "users.list",
		buttonLabel: "Permissions",
	}),
	spec("permissions.set", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["userId", "permission"],
		listIntent: "users.list",
	}),
	spec("permissions.clear", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["userId", "permission"],
		listIntent: "users.list",
	}),

	spec("catalog.dishes.list", "shallow", RESTAURANT, OWNER_STAFF, {
		menuSection: "Kitchen",
		buttonLabel: "Dishes",
		command: "dishes",
	}),
	spec("catalog.dishes.create", "shallow", RESTAURANT, OWNER, {
		requiredEntities: ["name"],
		example: "add dish paneer butter masala, plate, 220",
	}),
	spec("catalog.ingredients.list", "shallow", RESTAURANT, OWNER_STAFF, {
		menuSection: "Kitchen",
		buttonLabel: "Ingredients",
	}),
	spec("catalog.ingredients.create", "shallow", RESTAURANT, OWNER, {
		requiredEntities: ["name"],
		example: "add ingredient basmati rice, kg",
	}),
	spec("catalog.suppliers.list", "shallow", RESTAURANT, OWNER, {
		menuSection: "Settings",
		buttonLabel: "Suppliers",
	}),
	spec("catalog.suppliers.create", "shallow", RESTAURANT, OWNER, {
		requiredEntities: ["name"],
		example: "add supplier Krishna Traders, +91-9000000003",
	}),
	spec("catalog.recipe.get", "shallow", RESTAURANT, OWNER_STAFF, {
		requiredEntities: ["dishId"],
		listIntent: "catalog.dishes.list",
		buttonLabel: "Recipe",
	}),
	spec("catalog.recipe.put", "shallow", RESTAURANT, OWNER, {
		requiredEntities: ["dishId", "ingredients"],
		listIntent: "catalog.dishes.list",
	}),

	spec("notifications.preferences.get", "shallow", BOTH, OWNER_ADMIN, {
		menuSection: "Settings",
		buttonLabel: "Alerts",
	}),
	spec("notifications.preferences.set", "shallow", BOTH, OWNER_ADMIN, {
		requiredEntities: ["preferences"],
		example: "alert me about market listings within 10 km between 06:00 and 22:00",
	}),

	spec("admin.tenants.list", "out_of_tier", BOTH, SUPER, {}),
	spec("admin.verification.queue", "out_of_tier", BOTH, SUPER, {}),
	spec("admin.verification.decide", "out_of_tier", BOTH, SUPER, {
		requiredEntities: ["tenantId", "decision"],
		listIntent: "admin.verification.queue",
		destructive: true,
	}),
	spec("admin.analytics", "out_of_tier", BOTH, SUPER, {}),

	spec("help", "shallow", BOTH, ALL, {}),
	spec("menu", "shallow", BOTH, ALL, {}),
]

export const INTENT_NAMES: string[] = INTENTS.map((entry) => entry.intent)

const BY_NAME = new Map<string, IntentSpec>(INTENTS.map((entry) => [entry.intent, entry]))

export const findIntent = (name: string): IntentSpec | null => BY_NAME.get(name) ?? null

export const intentsForSession = (role: RoleValue, tenantType: TenantTypeValue): IntentSpec[] =>
	INTENTS.filter(
		(entry) =>
			entry.tier !== "out_of_tier" &&
			entry.roles.includes(role) &&
			entry.tenantTypes.includes(tenantType),
	)

export const MENU_ORDER: string[] = ["Kitchen", "Market", "Insights", "Team", "Settings"]

export type MenuGroup = { section: string; specs: IntentSpec[] }

export const menuSections = (role: RoleValue, tenantType: TenantTypeValue): MenuGroup[] => {
	const visible = intentsForSession(role, tenantType).filter(
		(entry) => entry.menuSection !== "" && entry.buttonLabel !== "",
	)
	return MENU_ORDER.map((section) => ({
		section,
		specs: visible.filter((entry) => entry.menuSection === section),
	})).filter((group) => group.specs.length > 0)
}

export const commandIntents = (): IntentSpec[] => INTENTS.filter((entry) => entry.command !== "")

export const adaptersForIntent = (intent: string): ParamAdapterSpec[] => {
	const spec = BY_NAME.get(intent)
	return spec == null ? [] : spec.paramAdapters
}

export const isDestructiveIntent = (intent: string): boolean => {
	const spec = BY_NAME.get(intent)
	return spec?.destructive === true
}

export const isConfirmationRequired = (intent: string): boolean => {
	const spec = BY_NAME.get(intent)
	return spec?.requiresConfirmation === true
}

export const WORKED_EXAMPLE_INTENTS: string[] = [
	"prep.create",
	"leftovers.record",
	"inventory.purchases.create",
	"inventory.adjustments.create",
]
