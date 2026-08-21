CREATE TYPE "public"."leftover_status" AS ENUM('pending_disposition', 'awaiting_reuse', 'closed');--> statement-breakpoint
CREATE TYPE "public"."listing_channel" AS ENUM('b2b', 'ngo');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('open', 'claimed', 'completed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."serving_unit" AS ENUM('kg', 'plate', 'piece', 'litre');--> statement-breakpoint
CREATE TYPE "public"."storage_method" AS ENUM('room_temp', 'refrigerated', 'frozen');--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"serving_unit" "serving_unit" DEFAULT 'kg' NOT NULL,
	"avg_serving_weight_g" numeric(10, 2),
	"selling_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"cost_per_unit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"shelf_life_hours" integer DEFAULT 24 NOT NULL,
	"is_reusable" boolean DEFAULT true NOT NULL,
	"reuse_route" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"base_unit" text DEFAULT 'g' NOT NULL,
	"piece_weight_g" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty_purchased_base" numeric(12, 3) NOT NULL,
	"qty_remaining_base" numeric(12, 3) NOT NULL,
	"unit_cost" numeric(10, 4) NOT NULL,
	"purchase_date" date NOT NULL,
	"expiry_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"lot_id" uuid,
	"ingredient_id" uuid NOT NULL,
	"qty_delta_base" numeric(12, 3) NOT NULL,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leftover_dispositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"leftover_id" uuid NOT NULL,
	"retain_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"sell_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"donate_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"waste_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"sell_price_per_unit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"ai_suggested_retain_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leftovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"prep_entry_id" uuid,
	"service_date" date NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"unit" "serving_unit" NOT NULL,
	"storage" "storage_method" DEFAULT 'room_temp' NOT NULL,
	"prepared_at" timestamp with time zone NOT NULL,
	"safe_until" timestamp with time zone NOT NULL,
	"status" "leftover_status" DEFAULT 'pending_disposition' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"event" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"leftover_id" uuid NOT NULL,
	"qty" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_ref" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'model' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prep_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"dish_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"meal_period" text NOT NULL,
	"qty_prepared" numeric(12, 3) NOT NULL,
	"qty_served" numeric(12, 3) DEFAULT '0' NOT NULL,
	"covers" integer,
	"prepared_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surplus_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"channel" "listing_channel" NOT NULL,
	"status" "listing_status" DEFAULT 'open' NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"unit" "serving_unit" NOT NULL,
	"price_per_unit" numeric(10, 2) DEFAULT '0' NOT NULL,
	"pickup_from" timestamp with time zone NOT NULL,
	"pickup_until" timestamp with time zone NOT NULL,
	"safe_until" timestamp with time zone NOT NULL,
	"escalate_at" timestamp with time zone,
	"claimed_by_tenant_id" uuid,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_inventory_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leftover_dispositions" ADD CONSTRAINT "leftover_dispositions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leftover_dispositions" ADD CONSTRAINT "leftover_dispositions_leftover_id_leftovers_id_fk" FOREIGN KEY ("leftover_id") REFERENCES "public"."leftovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leftover_dispositions" ADD CONSTRAINT "leftover_dispositions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leftovers" ADD CONSTRAINT "leftovers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leftovers" ADD CONSTRAINT "leftovers_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leftovers" ADD CONSTRAINT "leftovers_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leftovers" ADD CONSTRAINT "leftovers_prep_entry_id_prep_entries_id_fk" FOREIGN KEY ("prep_entry_id") REFERENCES "public"."prep_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_events" ADD CONSTRAINT "listing_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_events" ADD CONSTRAINT "listing_events_listing_id_surplus_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."surplus_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_listing_id_surplus_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."surplus_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_items" ADD CONSTRAINT "listing_items_leftover_id_leftovers_id_fk" FOREIGN KEY ("leftover_id") REFERENCES "public"."leftovers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_entries" ADD CONSTRAINT "prep_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_entries" ADD CONSTRAINT "prep_entries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_entries" ADD CONSTRAINT "prep_entries_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_listings" ADD CONSTRAINT "surplus_listings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_listings" ADD CONSTRAINT "surplus_listings_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surplus_listings" ADD CONSTRAINT "surplus_listings_claimed_by_tenant_id_tenants_id_fk" FOREIGN KEY ("claimed_by_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dishes_tenant_idx" ON "dishes" USING btree ("tenant_id","restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_tenant_name_key" ON "ingredients" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "inventory_lots_pick_idx" ON "inventory_lots" USING btree ("tenant_id","ingredient_id","expiry_date");--> statement-breakpoint
CREATE INDEX "inventory_movements_series_idx" ON "inventory_movements" USING btree ("tenant_id","ingredient_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leftover_dispositions_leftover_key" ON "leftover_dispositions" USING btree ("leftover_id");--> statement-breakpoint
CREATE INDEX "leftovers_service_idx" ON "leftovers" USING btree ("tenant_id","service_date");--> statement-breakpoint
CREATE INDEX "leftovers_status_idx" ON "leftovers" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "listing_events_listing_idx" ON "listing_events" USING btree ("listing_id","occurred_at");--> statement-breakpoint
CREATE INDEX "predictions_tenant_kind_idx" ON "predictions" USING btree ("tenant_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "prep_entries_service_idx" ON "prep_entries" USING btree ("tenant_id","service_date","meal_period");--> statement-breakpoint
CREATE INDEX "surplus_listings_open_idx" ON "surplus_listings" USING btree ("status","channel","pickup_until");--> statement-breakpoint
CREATE INDEX "surplus_listings_escalate_idx" ON "surplus_listings" USING btree ("escalate_at");