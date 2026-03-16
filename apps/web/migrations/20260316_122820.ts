import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_scraper_repos_source_type" AS ENUM('git', 'upload');
  CREATE TYPE "payload"."enum_scraper_repos_last_sync_status" AS ENUM('success', 'failed');
  CREATE TYPE "payload"."enum_scrapers_runtime" AS ENUM('python', 'node');
  CREATE TYPE "payload"."enum_scrapers_last_run_status" AS ENUM('success', 'failed', 'timeout', 'running');
  CREATE TYPE "payload"."enum_scraper_runs_status" AS ENUM('queued', 'running', 'success', 'failed', 'timeout');
  CREATE TYPE "payload"."enum_scraper_runs_triggered_by" AS ENUM('schedule', 'manual', 'webhook');
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'scraper-execution';
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'scraper-repo-sync';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'scraper-execution';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'scraper-repo-sync';
  CREATE TABLE "payload"."scraper_repos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" jsonb,
  	"slug" varchar,
  	"created_by_id" integer,
  	"source_type" "payload"."enum_scraper_repos_source_type" DEFAULT 'git' NOT NULL,
  	"git_url" varchar,
  	"git_branch" varchar DEFAULT 'main',
  	"code" jsonb,
  	"catalog_id" integer,
  	"last_sync_at" timestamp(3) with time zone,
  	"last_sync_status" "payload"."enum_scraper_repos_last_sync_status",
  	"last_sync_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."scrapers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"repo_id" integer NOT NULL,
  	"repo_created_by" numeric,
  	"runtime" "payload"."enum_scrapers_runtime" DEFAULT 'python' NOT NULL,
  	"entrypoint" varchar NOT NULL,
  	"output_file" varchar DEFAULT 'data.csv',
  	"schedule" varchar,
  	"enabled" boolean DEFAULT true,
  	"timeout_secs" numeric DEFAULT 300,
  	"memory_mb" numeric DEFAULT 512,
  	"env_vars" jsonb DEFAULT '{}'::jsonb,
  	"target_dataset_id" integer,
  	"auto_import" boolean DEFAULT false,
  	"last_run_at" timestamp(3) with time zone,
  	"last_run_status" "payload"."enum_scrapers_last_run_status",
  	"statistics" jsonb DEFAULT '{"totalRuns":0,"successRuns":0,"failedRuns":0}'::jsonb,
  	"next_run_at" timestamp(3) with time zone,
  	"webhook_enabled" boolean DEFAULT false,
  	"webhook_token" varchar,
  	"webhook_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."scraper_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"scraper_id" integer NOT NULL,
  	"scraper_owner" numeric,
  	"status" "payload"."enum_scraper_runs_status" DEFAULT 'queued' NOT NULL,
  	"triggered_by" "payload"."enum_scraper_runs_triggered_by" DEFAULT 'manual',
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"duration_ms" numeric,
  	"exit_code" numeric,
  	"stdout" varchar,
  	"stderr" varchar,
  	"error" varchar,
  	"output_rows" numeric,
  	"output_bytes" numeric,
  	"result_file_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."users" ADD COLUMN "quotas_max_scraper_repos" numeric;
  ALTER TABLE "payload"."users" ADD COLUMN "quotas_max_scraper_runs_per_day" numeric;
  ALTER TABLE "payload"."user_usage" ADD COLUMN "current_scraper_repos" numeric DEFAULT 0;
  ALTER TABLE "payload"."user_usage" ADD COLUMN "scraper_runs_today" numeric DEFAULT 0;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "scraper_repos_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "scrapers_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "scraper_runs_id" integer;
  ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_enable_scrapers" boolean DEFAULT false;
  ALTER TABLE "payload"."scraper_repos" ADD CONSTRAINT "scraper_repos_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scraper_repos" ADD CONSTRAINT "scraper_repos_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scrapers" ADD CONSTRAINT "scrapers_repo_id_scraper_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "payload"."scraper_repos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scrapers" ADD CONSTRAINT "scrapers_target_dataset_id_datasets_id_fk" FOREIGN KEY ("target_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scraper_runs" ADD CONSTRAINT "scraper_runs_scraper_id_scrapers_id_fk" FOREIGN KEY ("scraper_id") REFERENCES "payload"."scrapers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scraper_runs" ADD CONSTRAINT "scraper_runs_result_file_id_import_files_id_fk" FOREIGN KEY ("result_file_id") REFERENCES "payload"."import_files"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "scraper_repos_slug_idx" ON "payload"."scraper_repos" USING btree ("slug");
  CREATE INDEX "scraper_repos_created_by_idx" ON "payload"."scraper_repos" USING btree ("created_by_id");
  CREATE INDEX "scraper_repos_catalog_idx" ON "payload"."scraper_repos" USING btree ("catalog_id");
  CREATE INDEX "scraper_repos_updated_at_idx" ON "payload"."scraper_repos" USING btree ("updated_at");
  CREATE INDEX "scraper_repos_created_at_idx" ON "payload"."scraper_repos" USING btree ("created_at");
  CREATE INDEX "scraper_repos_deleted_at_idx" ON "payload"."scraper_repos" USING btree ("deleted_at");
  CREATE INDEX "scrapers_slug_idx" ON "payload"."scrapers" USING btree ("slug");
  CREATE INDEX "scrapers_repo_idx" ON "payload"."scrapers" USING btree ("repo_id");
  CREATE INDEX "scrapers_repo_created_by_idx" ON "payload"."scrapers" USING btree ("repo_created_by");
  CREATE INDEX "scrapers_target_dataset_idx" ON "payload"."scrapers" USING btree ("target_dataset_id");
  CREATE INDEX "scrapers_webhook_token_idx" ON "payload"."scrapers" USING btree ("webhook_token");
  CREATE INDEX "scrapers_updated_at_idx" ON "payload"."scrapers" USING btree ("updated_at");
  CREATE INDEX "scrapers_created_at_idx" ON "payload"."scrapers" USING btree ("created_at");
  CREATE INDEX "scrapers_deleted_at_idx" ON "payload"."scrapers" USING btree ("deleted_at");
  CREATE INDEX "scraper_runs_scraper_idx" ON "payload"."scraper_runs" USING btree ("scraper_id");
  CREATE INDEX "scraper_runs_scraper_owner_idx" ON "payload"."scraper_runs" USING btree ("scraper_owner");
  CREATE INDEX "scraper_runs_status_idx" ON "payload"."scraper_runs" USING btree ("status");
  CREATE INDEX "scraper_runs_result_file_idx" ON "payload"."scraper_runs" USING btree ("result_file_id");
  CREATE INDEX "scraper_runs_updated_at_idx" ON "payload"."scraper_runs" USING btree ("updated_at");
  CREATE INDEX "scraper_runs_created_at_idx" ON "payload"."scraper_runs" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scraper_repos_fk" FOREIGN KEY ("scraper_repos_id") REFERENCES "payload"."scraper_repos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scrapers_fk" FOREIGN KEY ("scrapers_id") REFERENCES "payload"."scrapers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scraper_runs_fk" FOREIGN KEY ("scraper_runs_id") REFERENCES "payload"."scraper_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_scraper_repos_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scraper_repos_id");
  CREATE INDEX "payload_locked_documents_rels_scrapers_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scrapers_id");
  CREATE INDEX "payload_locked_documents_rels_scraper_runs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scraper_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scraper_repos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."scrapers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."scraper_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."scraper_repos" CASCADE;
  DROP TABLE "payload"."scrapers" CASCADE;
  DROP TABLE "payload"."scraper_runs" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_scraper_repos_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_scrapers_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_scraper_runs_fk";
  
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup', 'audit-log-ip-cleanup', 'execute-account-deletion');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."payload_locked_documents_rels_scraper_repos_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_scrapers_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_scraper_runs_id_idx";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_scraper_repos";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_scraper_runs_per_day";
  ALTER TABLE "payload"."user_usage" DROP COLUMN "current_scraper_repos";
  ALTER TABLE "payload"."user_usage" DROP COLUMN "scraper_runs_today";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "scraper_repos_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "scrapers_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "scraper_runs_id";
  ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_enable_scrapers";
  DROP TYPE "payload"."enum_scraper_repos_source_type";
  DROP TYPE "payload"."enum_scraper_repos_last_sync_status";
  DROP TYPE "payload"."enum_scrapers_runtime";
  DROP TYPE "payload"."enum_scrapers_last_run_status";
  DROP TYPE "payload"."enum_scraper_runs_status";
  DROP TYPE "payload"."enum_scraper_runs_triggered_by";`)
}
