import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'cleanup-stuck-scrapers', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."users" ADD COLUMN "enable_a_p_i_key" boolean;
  ALTER TABLE "payload"."users" ADD COLUMN "api_key" varchar;
  ALTER TABLE "payload"."users" ADD COLUMN "api_key_index" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."users" DROP COLUMN "enable_a_p_i_key";
  ALTER TABLE "payload"."users" DROP COLUMN "api_key";
  ALTER TABLE "payload"."users" DROP COLUMN "api_key_index";`)
}
