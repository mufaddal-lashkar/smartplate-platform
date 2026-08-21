DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ingredients', 'dishes', 'inventory_lots', 'inventory_movements',
    'prep_entries', 'leftovers', 'leftover_dispositions',
    'surplus_listings', 'listing_items', 'listing_events', 'predictions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id())
       WITH CHECK (tenant_id = app_tenant_id())', t);
    EXECUTE format(
      'CREATE POLICY super_admin_all ON %I USING (app_role() = ''super_admin'')
       WITH CHECK (app_role() = ''super_admin'')', t);
  END LOOP;
END $$;
