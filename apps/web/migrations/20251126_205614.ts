import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_data_exports_status" AS ENUM('pending', 'processing', 'ready', 'failed', 'expired');
  CREATE TABLE "payload"."data_exports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"status" "payload"."enum_data_exports_status" DEFAULT 'pending' NOT NULL,
  	"requested_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone,
  	"file_path" varchar,
  	"file_size" numeric,
  	"download_count" numeric DEFAULT 0,
  	"summary" jsonb,
  	"error_log" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'data-export', 'data-export-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'data-export', 'data-export-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "data_exports_id" integer;
  ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_allow_private_imports" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_enable_scheduled_imports" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_enable_registration" boolean DEFAULT true;
  ALTER TABLE "payload"."data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "data_exports_user_idx" ON "payload"."data_exports" USING btree ("user_id");
  CREATE INDEX "data_exports_expires_at_idx" ON "payload"."data_exports" USING btree ("expires_at");
  CREATE INDEX "data_exports_updated_at_idx" ON "payload"."data_exports" USING btree ("updated_at");
  CREATE INDEX "data_exports_created_at_idx" ON "payload"."data_exports" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_exports_fk" FOREIGN KEY ("data_exports_id") REFERENCES "payload"."data_exports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_data_exports_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("data_exports_id");
  ALTER TABLE "payload"."catalogs" DROP COLUMN "language";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_language";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."data_exports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."data_exports" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_data_exports_fk";
  
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'execute-account-deletion');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'execute-account-deletion');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."payload_locked_documents_rels_data_exports_id_idx";
  ALTER TABLE "payload"."catalogs" ADD COLUMN "language" varchar DEFAULT 'eng';
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_language" varchar DEFAULT 'eng';
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "data_exports_id";
  ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_allow_private_imports";
  ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_enable_scheduled_imports";
  ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_enable_registration";
  DROP TYPE "payload"."enum_data_exports_status";`)
}
