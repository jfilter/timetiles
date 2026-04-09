import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "payload"."enum_datasets_ingest_transforms_type" ADD VALUE IF NOT EXISTS 'split-to-array' BEFORE 'extract';
  ALTER TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" ADD VALUE IF NOT EXISTS 'split-to-array' BEFORE 'extract';
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN IF NOT EXISTS "advanced_options_json_api_config_pagination_method" "payload"."si_json_paging_method" DEFAULT 'GET';
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN IF NOT EXISTS "advanced_options_json_api_config_pagination_body_template" varchar;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN IF NOT EXISTS "advanced_options_json_api_config_pagination_initial_body_template" varchar;
  ALTER TABLE "payload"."scheduled_ingests" ADD COLUMN IF NOT EXISTS "pre_processing_extract_fields" jsonb;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN IF NOT EXISTS "version_advanced_options_json_api_config_pagination_method" "payload"."si_json_paging_method" DEFAULT 'GET';
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN IF NOT EXISTS "version_advanced_options_json_api_config_pagination_body_template" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN IF NOT EXISTS "version_advanced_options_json_api_config_pagination_initial_body_template" varchar;
  ALTER TABLE "payload"."_scheduled_ingests_v" ADD COLUMN IF NOT EXISTS "version_pre_processing_extract_fields" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum_datasets_ingest_transforms_type";
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split', 'parse-json-array', 'extract');
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum_datasets_ingest_transforms_type";
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum_datasets_ingest_transforms_type" USING "type"::"payload"."enum_datasets_ingest_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_type";
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split', 'parse-json-array', 'extract');
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum__datasets_v_version_ingest_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" USING "type"::"payload"."enum__datasets_v_version_ingest_transforms_type";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_json_api_config_pagination_method";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_json_api_config_pagination_body_template";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "advanced_options_json_api_config_pagination_initial_body_template";
  ALTER TABLE "payload"."scheduled_ingests" DROP COLUMN "pre_processing_extract_fields";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_method";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_body_template";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_advanced_options_json_api_config_pagination_initial_body_template";
  ALTER TABLE "payload"."_scheduled_ingests_v" DROP COLUMN "version_pre_processing_extract_fields";
  DROP TYPE "payload"."si_json_paging_method";`)
}
