CREATE TYPE "public"."ngo_verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint

ALTER TABLE "users"
  ADD COLUMN "invited_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "ngos"
  ADD COLUMN "verification_status" "ngo_verification_status" DEFAULT 'pending' NOT NULL,
  ADD COLUMN "verification_submitted_at" timestamp with time zone,
  ADD COLUMN "verification_reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN "verification_reviewed_at" timestamp with time zone,
  ADD COLUMN "rejection_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint

UPDATE "ngos" SET "verification_status" = 'approved' WHERE "verified_at" IS NOT NULL;
UPDATE "ngos" SET "verification_status" = 'pending' WHERE "verified_at" IS NULL;--> statement-breakpoint

DROP POLICY IF EXISTS "users_super_admin_all" ON "users";--> statement-breakpoint
CREATE POLICY "users_super_admin_all" ON "users" USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

CREATE TABLE "user_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"granted" boolean NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_permissions_user_perm_key" ON "user_permissions" USING btree ("tenant_id","user_id","permission");--> statement-breakpoint
ALTER TABLE "user_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "user_permissions_tenant_isolation" ON "user_permissions";--> statement-breakpoint
CREATE POLICY "user_permissions_tenant_isolation" ON "user_permissions" USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());--> statement-breakpoint
DROP POLICY IF EXISTS "user_permissions_super_admin_all" ON "user_permissions";--> statement-breakpoint
CREATE POLICY "user_permissions_super_admin_all" ON "user_permissions" USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "audit_logs_tenant_isolation" ON "audit_logs";--> statement-breakpoint
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs" USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());--> statement-breakpoint
DROP POLICY IF EXISTS "audit_logs_super_admin_all" ON "audit_logs";--> statement-breakpoint
CREATE POLICY "audit_logs_super_admin_all" ON "audit_logs" USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"radius_km" numeric(6, 2),
	"active_from" text DEFAULT '00:00' NOT NULL,
	"active_to" text DEFAULT '23:59' NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_topic_key" ON "notification_preferences" USING btree ("tenant_id","user_id","topic");--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "notification_preferences_tenant_isolation" ON "notification_preferences";--> statement-breakpoint
CREATE POLICY "notification_preferences_tenant_isolation" ON "notification_preferences" USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());--> statement-breakpoint
DROP POLICY IF EXISTS "notification_preferences_super_admin_all" ON "notification_preferences";--> statement-breakpoint
CREATE POLICY "notification_preferences_super_admin_all" ON "notification_preferences" USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');
