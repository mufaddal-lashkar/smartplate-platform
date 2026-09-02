CREATE TABLE "telegram_chats" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_chats_user_idx" ON "telegram_chats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telegram_chats_tenant_idx" ON "telegram_chats" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "telegram_chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "telegram_chats" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "telegram_chats_tenant_isolation" ON "telegram_chats";--> statement-breakpoint
CREATE POLICY "telegram_chats_tenant_isolation" ON "telegram_chats" USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());--> statement-breakpoint
DROP POLICY IF EXISTS "telegram_chats_super_admin_all" ON "telegram_chats";--> statement-breakpoint
CREATE POLICY "telegram_chats_super_admin_all" ON "telegram_chats" USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

CREATE TABLE "bot_user_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"chat_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "bot_user_links" ADD CONSTRAINT "bot_user_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_user_links" ADD CONSTRAINT "bot_user_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bot_user_links_refresh_token_key" ON "bot_user_links" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "bot_user_links_user_idx" ON "bot_user_links" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "bot_user_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bot_user_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "bot_user_links_tenant_isolation" ON "bot_user_links";--> statement-breakpoint
CREATE POLICY "bot_user_links_tenant_isolation" ON "bot_user_links" USING ("tenant_id" = app_tenant_id()) WITH CHECK ("tenant_id" = app_tenant_id());--> statement-breakpoint
DROP POLICY IF EXISTS "bot_user_links_super_admin_all" ON "bot_user_links";--> statement-breakpoint
CREATE POLICY "bot_user_links_super_admin_all" ON "bot_user_links" USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint
DROP POLICY IF EXISTS "bot_user_links_system_all" ON "bot_user_links";--> statement-breakpoint
CREATE POLICY "bot_user_links_system_all" ON "bot_user_links" USING (app_role() = 'system') WITH CHECK (app_role() = 'system');
