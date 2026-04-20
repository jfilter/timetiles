import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_datasets_ingest_transforms_input_format" ADD VALUE 'YYYY/MM/DD';
  ALTER TYPE "payload"."enum_datasets_ingest_transforms_input_format" ADD VALUE 'D MMMM YYYY';
  ALTER TYPE "payload"."enum_datasets_ingest_transforms_input_format" ADD VALUE 'MMMM D, YYYY';
  ALTER TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format" ADD VALUE 'YYYY/MM/DD';
  ALTER TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format" ADD VALUE 'D MMMM YYYY';
  ALTER TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format" ADD VALUE 'MMMM D, YYYY';
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'send-email' BEFORE 'audit-log-ip-cleanup';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'send-email' BEFORE 'audit-log-ip-cleanup';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "input_format" SET DATA TYPE text;
  DROP TYPE "payload"."enum_datasets_ingest_transforms_input_format";
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_input_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY');
  ALTER TABLE "payload"."datasets_ingest_transforms" ALTER COLUMN "input_format" SET DATA TYPE "payload"."enum_datasets_ingest_transforms_input_format" USING "input_format"::"payload"."enum_datasets_ingest_transforms_input_format";
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "input_format" SET DATA TYPE text;
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format";
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY');
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ALTER COLUMN "input_format" SET DATA TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format" USING "input_format"::"payload"."enum__datasets_v_version_ingest_transforms_input_format";
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync', 'job-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync', 'job-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";`)
}
