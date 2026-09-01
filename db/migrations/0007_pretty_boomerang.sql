CREATE OR REPLACE FUNCTION public.current_restaurant_geog()
RETURNS geography(Point, 4326)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography
    FROM restaurants
   WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
   LIMIT 1
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_restaurant_radius_km()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT browse_radius_km FROM restaurants
   WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
   LIMIT 1
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_ngo_geog()
RETURNS geography(Point, 4326)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography
    FROM ngos
   WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
   LIMIT 1
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.current_ngo_radius_km()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT service_radius_km FROM ngos
   WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
   LIMIT 1
$$;--> statement-breakpoint

DROP POLICY IF EXISTS "listing_b2b_browse" ON "surplus_listings";--> statement-breakpoint
CREATE POLICY "listing_b2b_browse" ON "surplus_listings" FOR SELECT
  USING (
    "channel" = 'b2b'
    AND "status" = 'open'
    AND current_setting('app.tenant_type', true) = 'restaurant'
    AND "tenant_id" <> current_setting('app.tenant_id', true)::uuid
    AND public.current_restaurant_geog() IS NOT NULL
    AND ST_DWithin(
      "geog",
      public.current_restaurant_geog(),
      public.current_restaurant_radius_km() * 1000
    )
  );--> statement-breakpoint

DROP POLICY IF EXISTS "listing_ngo_browse" ON "surplus_listings";--> statement-breakpoint
CREATE POLICY "listing_ngo_browse" ON "surplus_listings" FOR SELECT
  USING (
    "channel" = 'ngo'
    AND "status" = 'open'
    AND current_setting('app.tenant_type', true) = 'ngo'
    AND public.current_ngo_geog() IS NOT NULL
    AND ST_DWithin(
      "geog",
      public.current_ngo_geog(),
      public.current_ngo_radius_km() * 1000
    )
  );--> statement-breakpoint
