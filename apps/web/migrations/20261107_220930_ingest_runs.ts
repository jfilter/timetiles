import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_ingest_runs_source" AS ENUM('manual', 'scheduled', 'scraper');
  CREATE TYPE "payload"."enum_ingest_runs_outcome" AS ENUM('pending', 'awaiting_review', 'completed', 'failed');
  CREATE TYPE "payload"."enum_scraper_runs_import_outcome" AS ENUM('pending', 'awaiting_review', 'completed', 'failed');
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'dispatch-ingest-run' BEFORE 'detect-schema';
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'reconcile-ingest-runs' BEFORE 'cleanup-stuck-scrapers';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'dispatch-ingest-run' BEFORE 'detect-schema';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'reconcile-ingest-runs' BEFORE 'cleanup-stuck-scrapers';
  CREATE TABLE "payload"."ingest_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source" "payload"."enum_ingest_runs_source" NOT NULL,
  	"ingest_file_id" integer,
  	"scheduled_ingest_id" integer,
  	"scraper_run_id" integer,
  	"expected_sheets" numeric NOT NULL,
  	"dispatched_at" timestamp(3) with time zone,
  	"outcome" "payload"."enum_ingest_runs_outcome" DEFAULT 'pending' NOT NULL,
  	"accounted_at" timestamp(3) with time zone,
  	"counted_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "run_id" integer;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "generation" numeric DEFAULT 0;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_run_id" integer;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_generation" numeric DEFAULT 0;
  ALTER TABLE "payload"."scraper_runs" ADD COLUMN "import_outcome" "payload"."enum_scraper_runs_import_outcome";
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "ingest_runs_id" integer;
  ALTER TABLE "payload"."ingest_runs" ADD CONSTRAINT "ingest_runs_ingest_file_id_ingest_files_id_fk" FOREIGN KEY ("ingest_file_id") REFERENCES "payload"."ingest_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_runs" ADD CONSTRAINT "ingest_runs_scheduled_ingest_id_scheduled_ingests_id_fk" FOREIGN KEY ("scheduled_ingest_id") REFERENCES "payload"."scheduled_ingests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."ingest_runs" ADD CONSTRAINT "ingest_runs_scraper_run_id_scraper_runs_id_fk" FOREIGN KEY ("scraper_run_id") REFERENCES "payload"."scraper_runs"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "ingest_runs_ingest_file_idx" ON "payload"."ingest_runs" USING btree ("ingest_file_id");
  CREATE INDEX "ingest_runs_scheduled_ingest_idx" ON "payload"."ingest_runs" USING btree ("scheduled_ingest_id");
  CREATE INDEX "ingest_runs_scraper_run_idx" ON "payload"."ingest_runs" USING btree ("scraper_run_id");
  CREATE INDEX "ingest_runs_outcome_idx" ON "payload"."ingest_runs" USING btree ("outcome");
  CREATE INDEX "ingest_runs_updated_at_idx" ON "payload"."ingest_runs" USING btree ("updated_at");
  CREATE INDEX "ingest_runs_created_at_idx" ON "payload"."ingest_runs" USING btree ("created_at");
  ALTER TABLE "payload"."ingest_jobs" ADD CONSTRAINT "ingest_jobs_run_id_ingest_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "payload"."ingest_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD CONSTRAINT "_ingest_jobs_v_version_run_id_ingest_runs_id_fk" FOREIGN KEY ("version_run_id") REFERENCES "payload"."ingest_runs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ingest_runs_fk" FOREIGN KEY ("ingest_runs_id") REFERENCES "payload"."ingest_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ingest_jobs_run_idx" ON "payload"."ingest_jobs" USING btree ("run_id");
  CREATE INDEX "_ingest_jobs_v_version_version_run_idx" ON "payload"."_ingest_jobs_v" USING btree ("version_run_id");
  CREATE INDEX "payload_locked_documents_rels_ingest_runs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("ingest_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The generator dropped the constraints after `DROP TABLE … CASCADE`, which already removes
  // them, and restored the task enums while rows could still hold the new slugs.
  await db.execute(sql`
  ALTER TABLE "payload"."ingest_jobs" DROP CONSTRAINT "ingest_jobs_run_id_ingest_runs_id_fk";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP CONSTRAINT "_ingest_jobs_v_version_run_id_ingest_runs_id_fk";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ingest_runs_fk";
  ALTER TABLE "payload"."ingest_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."ingest_runs" CASCADE;
  DELETE FROM "payload"."payload_jobs_log" WHERE "task_slug" IN ('dispatch-ingest-run', 'reconcile-ingest-runs');
  DELETE FROM "payload"."payload_jobs" WHERE "task_slug" IN ('dispatch-ingest-run', 'reconcile-ingest-runs');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'quota-reset', 'rate-limit-cleanup', 'cache-cleanup', 'preview-cleanup', 'ingest-files-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'send-email', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync', 'job-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-ingests', 'cleanup-stuck-scrapers', 'quota-reset', 'rate-limit-cleanup', 'cache-cleanup', 'preview-cleanup', 'ingest-files-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'send-email', 'audit-log-ip-cleanup', 'execute-account-deletion', 'scraper-execution', 'scraper-repo-sync', 'job-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."ingest_jobs_run_idx";
  DROP INDEX "payload"."_ingest_jobs_v_version_version_run_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_ingest_runs_id_idx";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "run_id";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "generation";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_run_id";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_generation";
  ALTER TABLE "payload"."scraper_runs" DROP COLUMN "import_outcome";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "ingest_runs_id";
  DROP TYPE "payload"."enum_ingest_runs_source";
  DROP TYPE "payload"."enum_ingest_runs_outcome";
  DROP TYPE "payload"."enum_scraper_runs_import_outcome";`)
}
