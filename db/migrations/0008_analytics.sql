CREATE TABLE "prediction_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"predicted_value" numeric(12, 3) NOT NULL,
	"actual_value" numeric(12, 3) NOT NULL,
	"abs_error" numeric(12, 3) NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'model' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prediction_scores_kind_check" CHECK (kind IN ('reuse'))
);
--> statement-breakpoint
ALTER TABLE "prediction_scores" ADD CONSTRAINT "prediction_scores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prediction_scores" ADD CONSTRAINT "prediction_scores_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "prediction_scores_tenant_idx" ON "prediction_scores" USING btree ("tenant_id","kind","period_end");
--> statement-breakpoint
CREATE INDEX "prediction_scores_period_idx" ON "prediction_scores" USING btree ("period_end");
--> statement-breakpoint
ALTER TABLE prediction_scores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE prediction_scores FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON prediction_scores
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
CREATE POLICY super_admin_all ON prediction_scores
  USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');
