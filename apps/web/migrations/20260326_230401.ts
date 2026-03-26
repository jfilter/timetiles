import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_datasets_ingest_transforms_type" ADD VALUE 'parse-json-array';
  ALTER TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" ADD VALUE 'parse-json-array';
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'job-cleanup';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'job-cleanup';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum_datasets_ingest_transforms_type";
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split');
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum_datasets_ingest_transforms_type";
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum_datasets_ingest_transforms_type" USING "type"::"payload"."enum_datasets_ingest_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::text;
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_type";
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split');
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DEFAULT 'rename'::"payload"."enum__datasets_v_version_ingest_transforms_type";
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "type" SET DATA TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" USING "type"::"payload"."enum__datasets_v_version_ingest_transforms_type";
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";`)
}
