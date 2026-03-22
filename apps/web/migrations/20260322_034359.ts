import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DATA TYPE text;
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum_ingest_jobs_stage";
  UPDATE "payload"."ingest_jobs" SET "stage" = 'needs-review' WHERE "stage" = 'await-approval';
  CREATE TYPE "payload"."enum_ingest_jobs_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum_ingest_jobs_stage";
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DATA TYPE "payload"."enum_ingest_jobs_stage" USING "stage"::"payload"."enum_ingest_jobs_stage";
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "last_successful_stage" SET DATA TYPE text;
  DROP TYPE "payload"."enum_ingest_jobs_last_successful_stage";
  UPDATE "payload"."ingest_jobs" SET "last_successful_stage" = 'needs-review' WHERE "last_successful_stage" = 'await-approval';
  CREATE TYPE "payload"."enum_ingest_jobs_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "last_successful_stage" SET DATA TYPE "payload"."enum_ingest_jobs_last_successful_stage" USING "last_successful_stage"::"payload"."enum_ingest_jobs_last_successful_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE text;
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum__ingest_jobs_v_version_stage";
  UPDATE "payload"."_ingest_jobs_v" SET "version_stage" = 'needs-review' WHERE "version_stage" = 'await-approval';
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum__ingest_jobs_v_version_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE "payload"."enum__ingest_jobs_v_version_stage" USING "version_stage"::"payload"."enum__ingest_jobs_v_version_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_last_successful_stage" SET DATA TYPE text;
  DROP TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage";
  UPDATE "payload"."_ingest_jobs_v" SET "version_last_successful_stage" = 'needs-review' WHERE "version_last_successful_stage" = 'await-approval';
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_last_successful_stage" SET DATA TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" USING "version_last_successful_stage"::"payload"."enum__ingest_jobs_v_version_last_successful_stage";
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DATA TYPE text;
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum_ingest_jobs_stage";
  UPDATE "payload"."ingest_jobs" SET "stage" = 'await-approval' WHERE "stage" = 'needs-review';
  CREATE TYPE "payload"."enum_ingest_jobs_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum_ingest_jobs_stage";
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DATA TYPE "payload"."enum_ingest_jobs_stage" USING "stage"::"payload"."enum_ingest_jobs_stage";
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "last_successful_stage" SET DATA TYPE text;
  DROP TYPE "payload"."enum_ingest_jobs_last_successful_stage";
  UPDATE "payload"."ingest_jobs" SET "last_successful_stage" = 'await-approval' WHERE "last_successful_stage" = 'needs-review';
  CREATE TYPE "payload"."enum_ingest_jobs_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "last_successful_stage" SET DATA TYPE "payload"."enum_ingest_jobs_last_successful_stage" USING "last_successful_stage"::"payload"."enum_ingest_jobs_last_successful_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE text;
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum__ingest_jobs_v_version_stage";
  UPDATE "payload"."_ingest_jobs_v" SET "version_stage" = 'await-approval' WHERE "version_stage" = 'needs-review';
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum__ingest_jobs_v_version_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE "payload"."enum__ingest_jobs_v_version_stage" USING "version_stage"::"payload"."enum__ingest_jobs_v_version_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_last_successful_stage" SET DATA TYPE text;
  DROP TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage";
  UPDATE "payload"."_ingest_jobs_v" SET "version_last_successful_stage" = 'await-approval' WHERE "version_last_successful_stage" = 'needs-review';
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_last_successful_stage" SET DATA TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" USING "version_last_successful_stage"::"payload"."enum__ingest_jobs_v_version_last_successful_stage";
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";`)
}
