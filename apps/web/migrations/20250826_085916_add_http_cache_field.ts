import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'cache-cleanup';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'cache-cleanup';
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_use_http_cache" boolean DEFAULT true;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_bypass_cache_on_manual" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_respect_cache_control" boolean DEFAULT true;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_use_http_cache" boolean DEFAULT true;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_bypass_cache_on_manual" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_respect_cache_control" boolean DEFAULT true;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_use_http_cache";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_bypass_cache_on_manual";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_respect_cache_control";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_use_http_cache";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_bypass_cache_on_manual";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_respect_cache_control";`);
}
