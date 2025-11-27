import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_deletion_audit_log_deletion_type" AS ENUM('self', 'admin', 'scheduled');
  CREATE TYPE "payload"."enum_users_deletion_status" AS ENUM('active', 'pending_deletion', 'deleted');
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'execute-account-deletion';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'execute-account-deletion';
  CREATE TABLE "payload"."deletion_audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"deleted_user_id" numeric NOT NULL,
  	"deleted_user_email_hash" varchar NOT NULL,
  	"deleted_at" timestamp(3) with time zone NOT NULL,
  	"deletion_requested_at" timestamp(3) with time zone,
  	"deleted_by_id" integer,
  	"deletion_type" "payload"."enum_deletion_audit_log_deletion_type" NOT NULL,
  	"reason" varchar,
  	"data_transferred" jsonb,
  	"data_deleted" jsonb,
  	"ip_address_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."users" ADD COLUMN "deletion_status" "payload"."enum_users_deletion_status" DEFAULT 'active';
  ALTER TABLE "payload"."users" ADD COLUMN "deletion_scheduled_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "deletion_requested_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "deletion_audit_log_id" integer;
  ALTER TABLE "payload"."deletion_audit_log" ADD CONSTRAINT "deletion_audit_log_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "deletion_audit_log_deleted_user_id_idx" ON "payload"."deletion_audit_log" USING btree ("deleted_user_id");
  CREATE INDEX "deletion_audit_log_deleted_at_idx" ON "payload"."deletion_audit_log" USING btree ("deleted_at");
  CREATE INDEX "deletion_audit_log_deleted_by_idx" ON "payload"."deletion_audit_log" USING btree ("deleted_by_id");
  CREATE INDEX "deletion_audit_log_updated_at_idx" ON "payload"."deletion_audit_log" USING btree ("updated_at");
  CREATE INDEX "deletion_audit_log_created_at_idx" ON "payload"."deletion_audit_log" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_deletion_audit_log_fk" FOREIGN KEY ("deletion_audit_log_id") REFERENCES "payload"."deletion_audit_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_deletion_audit_log_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("deletion_audit_log_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."deletion_audit_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."deletion_audit_log" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_deletion_audit_log_fk";
  
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."payload_locked_documents_rels_deletion_audit_log_id_idx";
  ALTER TABLE "payload"."users" DROP COLUMN "deletion_status";
  ALTER TABLE "payload"."users" DROP COLUMN "deletion_scheduled_at";
  ALTER TABLE "payload"."users" DROP COLUMN "deletion_requested_at";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "deletion_audit_log_id";
  DROP TYPE "payload"."enum_deletion_audit_log_deletion_type";
  DROP TYPE "payload"."enum_users_deletion_status";`)
}
