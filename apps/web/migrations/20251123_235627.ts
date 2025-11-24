import { sql } from '@payloadcms/db-postgres'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_settings_geocoding_provider_selection_required_tags" AS ENUM('production', 'development', 'testing', 'primary', 'secondary', 'backup');
  CREATE TYPE "payload"."enum_settings_geocoding_provider_selection_strategy" AS ENUM('priority', 'tag-based');
  CREATE TABLE "payload"."settings_geocoding_provider_selection_required_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_settings_geocoding_provider_selection_required_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "payload"."settings" ADD COLUMN "geocoding_enabled" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "geocoding_fallback_enabled" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "geocoding_provider_selection_strategy" "payload"."enum_settings_geocoding_provider_selection_strategy" DEFAULT 'priority';
  ALTER TABLE "payload"."settings" ADD COLUMN "geocoding_caching_enabled" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "geocoding_caching_ttl_days" numeric DEFAULT 30;
  ALTER TABLE "payload"."settings_geocoding_provider_selection_required_tags" ADD CONSTRAINT "settings_geocoding_provider_selection_required_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "settings_geocoding_provider_selection_required_tags_order_idx" ON "payload"."settings_geocoding_provider_selection_required_tags" USING btree ("order");
  CREATE INDEX "settings_geocoding_provider_selection_required_tags_parent_idx" ON "payload"."settings_geocoding_provider_selection_required_tags" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."settings_geocoding_provider_selection_required_tags" CASCADE;
  ALTER TABLE "payload"."settings" DROP COLUMN "geocoding_enabled";
  ALTER TABLE "payload"."settings" DROP COLUMN "geocoding_fallback_enabled";
  ALTER TABLE "payload"."settings" DROP COLUMN "geocoding_provider_selection_strategy";
  ALTER TABLE "payload"."settings" DROP COLUMN "geocoding_caching_enabled";
  ALTER TABLE "payload"."settings" DROP COLUMN "geocoding_caching_ttl_days";
  DROP TYPE "payload"."enum_settings_geocoding_provider_selection_required_tags";
  DROP TYPE "payload"."enum_settings_geocoding_provider_selection_strategy";`)
}
