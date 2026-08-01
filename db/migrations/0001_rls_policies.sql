CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.role', true), ''), '')
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['restaurants', 'ngos', 'users', 'notifications', 'job_runs']
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
--> statement-breakpoint
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self ON tenants USING (id = app_tenant_id()) WITH CHECK (id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY tenant_super_admin ON tenants USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');
--> statement-breakpoint
CREATE POLICY system_auth_lookup ON users USING (app_role() = 'system') WITH CHECK (app_role() = 'system');
--> statement-breakpoint
CREATE POLICY system_auth_tenant ON tenants USING (app_role() = 'system') WITH CHECK (app_role() = 'system');
