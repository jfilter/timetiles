import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."trig_by" AS ENUM('schedule', 'webhook', 'manual', 'system');
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'cleanup-stuck-scheduled-imports';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'cleanup-stuck-scheduled-imports';
  ALTER TABLE "payload"."scheduled_imports_execution_history" ADD COLUMN "triggered_by" "payload"."trig_by" DEFAULT 'schedule';
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "webhook_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "webhook_token" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "webhook_url" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" ADD COLUMN "triggered_by" "payload"."trig_by" DEFAULT 'schedule';
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_webhook_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_webhook_token" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_webhook_url" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."scheduled_imports_execution_history" DROP COLUMN "triggered_by";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "webhook_enabled";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "webhook_token";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "webhook_url";
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" DROP COLUMN "triggered_by";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_webhook_enabled";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_webhook_token";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_webhook_url";
  DROP TYPE "payload"."trig_by";`)
}
