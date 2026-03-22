import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_payload_jobs_workflow_slug" AS ENUM('manual-ingest', 'scheduled-ingest', 'scraper-ingest', 'ingest-process');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DATA TYPE text;
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum_ingest_jobs_stage";
  CREATE TYPE "payload"."enum_ingest_jobs_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum_ingest_jobs_stage";
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DATA TYPE "payload"."enum_ingest_jobs_stage" USING "stage"::"payload"."enum_ingest_jobs_stage";
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "last_successful_stage" SET DATA TYPE text;
  DROP TYPE "payload"."enum_ingest_jobs_last_successful_stage";
  CREATE TYPE "payload"."enum_ingest_jobs_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "last_successful_stage" SET DATA TYPE "payload"."enum_ingest_jobs_last_successful_stage" USING "last_successful_stage"::"payload"."enum_ingest_jobs_last_successful_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE text;
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum__ingest_jobs_v_version_stage";
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum__ingest_jobs_v_version_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE "payload"."enum__ingest_jobs_v_version_stage" USING "version_stage"::"payload"."enum__ingest_jobs_v_version_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_last_successful_stage" SET DATA TYPE text;
  DROP TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage";
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_last_successful_stage" SET DATA TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" USING "version_last_successful_stage"::"payload"."enum__ingest_jobs_v_version_last_successful_stage";
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."payload_jobs" ADD COLUMN "workflow_slug" "payload"."enum_payload_jobs_workflow_slug";
  CREATE INDEX "payload_jobs_workflow_slug_idx" ON "payload"."payload_jobs" USING btree ("workflow_slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DATA TYPE text;
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum_ingest_jobs_stage";
  CREATE TYPE "payload"."enum_ingest_jobs_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum_ingest_jobs_stage";
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "stage" SET DATA TYPE "payload"."enum_ingest_jobs_stage" USING "stage"::"payload"."enum_ingest_jobs_stage";
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "last_successful_stage" SET DATA TYPE text;
  DROP TYPE "payload"."enum_ingest_jobs_last_successful_stage";
  CREATE TYPE "payload"."enum_ingest_jobs_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."ingest_jobs" ALTER COLUMN "last_successful_stage" SET DATA TYPE "payload"."enum_ingest_jobs_last_successful_stage" USING "last_successful_stage"::"payload"."enum_ingest_jobs_last_successful_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE text;
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::text;
  DROP TYPE "payload"."enum__ingest_jobs_v_version_stage";
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'create-schema-version', 'geocode-batch', 'create-events', 'completed', 'failed');
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DEFAULT 'analyze-duplicates'::"payload"."enum__ingest_jobs_v_version_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_stage" SET DATA TYPE "payload"."enum__ingest_jobs_v_version_stage" USING "version_stage"::"payload"."enum__ingest_jobs_v_version_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_last_successful_stage" SET DATA TYPE text;
  DROP TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage";
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."_ingest_jobs_v" ALTER COLUMN "version_last_successful_stage" SET DATA TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" USING "version_last_successful_stage"::"payload"."enum__ingest_jobs_v_version_last_successful_stage";
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."payload_jobs_workflow_slug_idx";
  ALTER TABLE "payload"."payload_jobs" DROP COLUMN "workflow_slug";
  DROP TYPE "payload"."enum_payload_jobs_workflow_slug";`)
}
