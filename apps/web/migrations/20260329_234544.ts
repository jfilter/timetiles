import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."si_response_format" ADD VALUE 'html-in-json';
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_json_api_config_pagination_max_pages_path" varchar;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN "advanced_options_html_extract_config" jsonb;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_json_api_config_pagination_max_pages_path" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN "version_advanced_options_html_extract_config" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "advanced_options_response_format" SET DATA TYPE text;
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "advanced_options_response_format" SET DEFAULT 'auto'::text;
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_advanced_options_response_format" SET DATA TYPE text;
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_advanced_options_response_format" SET DEFAULT 'auto'::text;
  DROP TYPE "payload"."si_response_format";
  CREATE TYPE "payload"."si_response_format" AS ENUM('auto', 'csv', 'json');
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "advanced_options_response_format" SET DEFAULT 'auto'::"payload"."si_response_format";
  ALTER TABLE "payload"."scheduled_ingests" ALTER COLUMN "advanced_options_response_format" SET DATA TYPE "payload"."si_response_format" USING "advanced_options_response_format"::"payload"."si_response_format";
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_advanced_options_response_format" SET DEFAULT 'auto'::"payload"."si_response_format";
  ALTER TABLE "payload"."_scheduled_ingests_v" ALTER COLUMN "version_advanced_options_response_format" SET DATA TYPE "payload"."si_response_format" USING "version_advanced_options_response_format"::"payload"."si_response_format";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_json_api_config_pagination_max_pages_path";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_html_extract_config";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_max_pages_path";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_html_extract_config";`)
}
