import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_ingest_recovery_runs_mode" AS ENUM('report', 'apply');
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'ingest-recovery' BEFORE 'cleanup-stuck-scrapers';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'ingest-recovery' BEFORE 'cleanup-stuck-scrapers';
  CREATE TABLE "payload"."ingest_recovery_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"mode" "payload"."enum_ingest_recovery_runs_mode" NOT NULL,
  	"found" numeric NOT NULL,
  	"applied" numeric NOT NULL,
  	"skipped" numeric NOT NULL,
  	"findings" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "recovery_attempts" numeric DEFAULT 0;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_recovery_attempts" numeric DEFAULT 0;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "ingest_recovery_runs_id" integer;
  CREATE INDEX "ingest_recovery_runs_updated_at_idx" ON "payload"."ingest_recovery_runs" USING btree ("updated_at");
  CREATE INDEX "ingest_recovery_runs_created_at_idx" ON "payload"."ingest_recovery_runs" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ingest_recovery_runs_fk" FOREIGN KEY ("ingest_recovery_runs_id") REFERENCES "payload"."ingest_recovery_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ingest_recovery_runs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("ingest_recovery_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The generator dropped the constraint after `DROP TABLE … CASCADE`, which already removes it.
  await db.execute(sql`
   ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ingest_recovery_runs_fk";
  ALTER TABLE "payload"."ingest_recovery_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."ingest_recovery_runs" CASCADE;

  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'dispatch-ingest-run', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'reconcile-ingest-runs', 'cleanup-stuck-scrapers', 'quota-reset', 'rate-limit-cleanup', 'cache-cleanup', 'preview-cleanup', 'ingest-files-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'send-email', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync', 'job-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'dispatch-ingest-run', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'reconcile-ingest-runs', 'cleanup-stuck-scrapers', 'quota-reset', 'rate-limit-cleanup', 'cache-cleanup', 'preview-cleanup', 'ingest-files-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'send-email', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync', 'job-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."payload_locked_documents_rels_ingest_recovery_runs_id_idx";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "recovery_attempts";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_recovery_attempts";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "ingest_recovery_runs_id";
  DROP TYPE "payload"."enum_ingest_recovery_runs_mode";`)
}
