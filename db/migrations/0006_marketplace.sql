CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint

ALTER TABLE "surplus_listings" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "surplus_listings" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint

ALTER TABLE "surplus_listings" ADD COLUMN "geog" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "latitude" IS NOT NULL AND "longitude" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint("longitude"::float8, "latitude"::float8), 4326)::geography
      ELSE NULL
    END
  ) STORED;--> statement-breakpoint

CREATE INDEX "surplus_listings_geog_gist" ON "surplus_listings" USING GIST ("geog") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "restaurants_geog_gist" ON "restaurants" USING GIST (CAST(ST_SetSRID(ST_MakePoint("longitude"::float8, "latitude"::float8), 4326) AS geography)) WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ngos_geog_gist" ON "ngos" USING GIST (CAST(ST_SetSRID(ST_MakePoint("longitude"::float8, "latitude"::float8), 4326) AS geography)) WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;--> statement-breakpoint

DROP POLICY "tenant_isolation" ON "surplus_listings";--> statement-breakpoint
CREATE POLICY "listing_owner" ON "surplus_listings"
  USING      ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY "listing_b2b_browse" ON "surplus_listings" FOR SELECT
  USING (
    "channel" = 'b2b'
    AND "status" = 'open'
    AND current_setting('app.tenant_type', true) = 'restaurant'
    AND "tenant_id" <> current_setting('app.tenant_id', true)::uuid
    AND ST_DWithin(
          "geog",
          (SELECT ST_SetSRID(ST_MakePoint("longitude"::float8, "latitude"::float8), 4326)::geography
             FROM "restaurants"
            WHERE "tenant_id" = current_setting('app.tenant_id', true)::uuid
            LIMIT 1),
          (SELECT "browse_radius_km" * 1000 FROM "restaurants"
            WHERE "tenant_id" = current_setting('app.tenant_id', true)::uuid
            LIMIT 1))
  );--> statement-breakpoint

CREATE POLICY "listing_ngo_browse" ON "surplus_listings" FOR SELECT
  USING (
    "channel" = 'ngo'
    AND "status" = 'open'
    AND current_setting('app.tenant_type', true) = 'ngo'
    AND ST_DWithin(
          "geog",
          (SELECT ST_SetSRID(ST_MakePoint("longitude"::float8, "latitude"::float8), 4326)::geography
             FROM "ngos"
            WHERE "tenant_id" = current_setting('app.tenant_id', true)::uuid
            LIMIT 1),
          (SELECT "service_radius_km" * 1000 FROM "ngos"
            WHERE "tenant_id" = current_setting('app.tenant_id', true)::uuid
            LIMIT 1))
  );--> statement-breakpoint

CREATE POLICY "listing_claimed" ON "surplus_listings" FOR SELECT
  USING ("claimed_by_tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

DROP POLICY "tenant_isolation" ON "listing_items";--> statement-breakpoint
CREATE POLICY "listing_items_visibility" ON "listing_items" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "surplus_listings" "l"
       WHERE "l"."id" = "listing_items"."listing_id"
         AND (
           "l"."tenant_id" = current_setting('app.tenant_id', true)::uuid
           OR ("l"."channel" = 'b2b' AND "l"."status" = 'open' AND current_setting('app.tenant_type', true) = 'restaurant')
           OR ("l"."channel" = 'ngo' AND "l"."status" = 'open' AND current_setting('app.tenant_type', true) = 'ngo')
           OR "l"."claimed_by_tenant_id" = current_setting('app.tenant_id', true)::uuid
         )
    )
  );--> statement-breakpoint
CREATE POLICY "listing_items_write" ON "listing_items" FOR ALL
  USING      ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

DROP POLICY "tenant_isolation" ON "listing_events";--> statement-breakpoint
CREATE POLICY "listing_events_visibility" ON "listing_events" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "surplus_listings" "l"
       WHERE "l"."id" = "listing_events"."listing_id"
         AND (
           "l"."tenant_id" = current_setting('app.tenant_id', true)::uuid
           OR "l"."claimed_by_tenant_id" = current_setting('app.tenant_id', true)::uuid
         )
    )
  );--> statement-breakpoint
CREATE POLICY "listing_events_write" ON "listing_events" FOR ALL
  USING      ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint

CREATE POLICY "surplus_listings_super_admin" ON "surplus_listings"
  USING      (current_setting('app.role', true) = 'super_admin')
  WITH CHECK (current_setting('app.role', true) = 'super_admin');--> statement-breakpoint

CREATE POLICY "listing_items_super_admin" ON "listing_items"
  USING      (current_setting('app.role', true) = 'super_admin')
  WITH CHECK (current_setting('app.role', true) = 'super_admin');--> statement-breakpoint

CREATE POLICY "listing_events_super_admin" ON "listing_events"
  USING      (current_setting('app.role', true) = 'super_admin')
  WITH CHECK (current_setting('app.role', true) = 'super_admin');
