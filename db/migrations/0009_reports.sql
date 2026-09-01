CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"report_type" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"format" text NOT NULL,
	"artifact_path" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_tenant_idx" ON "reports" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "reports_tenant_isolation" ON "reports";--> statement-breakpoint
CREATE POLICY "reports_tenant_isolation" ON "reports" USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());--> statement-breakpoint
DROP POLICY IF EXISTS "reports_super_admin_all" ON "reports";--> statement-breakpoint
CREATE POLICY "reports_super_admin_all" ON "reports" USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'));
