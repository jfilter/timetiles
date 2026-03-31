import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."si_json_paging_method" AS ENUM('GET', 'POST');
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_json_api_config_pagination_method" "payload"."si_json_paging_method" DEFAULT 'GET';
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_json_api_config_pagination_body_template" varchar;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "pre_processing_extract_fields" jsonb;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_method" "payload"."si_json_paging_method" DEFAULT 'GET';
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_body_template" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_pre_processing_extract_fields" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_json_api_config_pagination_method";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_json_api_config_pagination_body_template";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "pre_processing_extract_fields";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_method";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_body_template";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_pre_processing_extract_fields";
  DROP TYPE "payload"."si_json_paging_method";`)
}
