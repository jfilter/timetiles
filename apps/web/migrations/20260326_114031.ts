import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_country_codes" jsonb;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_view_box_min_lon" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_view_box_min_lat" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_view_box_max_lon" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_view_box_max_lat" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_geocoding_bias_bounded" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_country_codes" jsonb;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_view_box_min_lon" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_view_box_min_lat" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_view_box_max_lon" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_view_box_max_lat" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_geocoding_bias_bounded" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_country_codes";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_view_box_min_lon";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_view_box_min_lat";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_view_box_max_lon";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_view_box_max_lat";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_geocoding_bias_bounded";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_country_codes";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_view_box_min_lon";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_view_box_min_lat";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_view_box_max_lon";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_view_box_max_lat";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_geocoding_bias_bounded";`)
}
