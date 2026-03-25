import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_skip_timestamp_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_skip_location_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_skip_empty_row_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_skip_row_error_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_skip_duplicate_rate_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_skip_geocoding_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_empty_row_threshold" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_row_error_threshold" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_duplicate_rate_threshold" numeric;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_review_checks_geocoding_failure_threshold" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_skip_timestamp_check" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_skip_location_check" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_skip_empty_row_check" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_skip_row_error_check" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_skip_duplicate_rate_check" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_skip_geocoding_check" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_empty_row_threshold" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_row_error_threshold" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_duplicate_rate_threshold" numeric;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_review_checks_geocoding_failure_threshold" numeric;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_skip_timestamp_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_skip_location_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_skip_empty_row_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_skip_row_error_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_skip_duplicate_rate_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_skip_geocoding_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_empty_row_threshold" numeric;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_row_error_threshold" numeric;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_duplicate_rate_threshold" numeric;
  ALTER TABLE "payload"."scrapers" ADD COLUMN "review_checks_geocoding_failure_threshold" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_skip_timestamp_check";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_skip_location_check";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_skip_empty_row_check";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_skip_row_error_check";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_skip_duplicate_rate_check";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_skip_geocoding_check";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_empty_row_threshold";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_row_error_threshold";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_duplicate_rate_threshold";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_review_checks_geocoding_failure_threshold";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_skip_timestamp_check";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_skip_location_check";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_skip_empty_row_check";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_skip_row_error_check";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_skip_duplicate_rate_check";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_skip_geocoding_check";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_empty_row_threshold";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_row_error_threshold";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_duplicate_rate_threshold";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_review_checks_geocoding_failure_threshold";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_skip_timestamp_check";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_skip_location_check";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_skip_empty_row_check";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_skip_row_error_check";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_skip_duplicate_rate_check";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_skip_geocoding_check";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_empty_row_threshold";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_row_error_threshold";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_duplicate_rate_threshold";
  ALTER TABLE "payload"."scrapers" DROP COLUMN "review_checks_geocoding_failure_threshold";`)
}
