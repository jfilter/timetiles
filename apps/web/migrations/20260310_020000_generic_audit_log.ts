import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Add new job slug to enums
  await db.execute(sql`
   ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'audit-log-ip-cleanup';
   ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'audit-log-ip-cleanup';
  `)

  // Create new generic audit_log table
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "payload"."audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"action" varchar NOT NULL,
  	"user_id" numeric NOT NULL,
  	"user_email_hash" varchar NOT NULL,
  	"performed_by_id" integer,
  	"timestamp" timestamp(3) with time zone NOT NULL,
  	"ip_address" varchar,
  	"ip_address_hash" varchar,
  	"details" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload"."audit_log" ADD CONSTRAINT "audit_log_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "payload"."audit_log" USING btree ("action");
  CREATE INDEX IF NOT EXISTS "audit_log_user_id_idx" ON "payload"."audit_log" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "audit_log_performed_by_idx" ON "payload"."audit_log" USING btree ("performed_by_id");
  CREATE INDEX IF NOT EXISTS "audit_log_timestamp_idx" ON "payload"."audit_log" USING btree ("timestamp");
  CREATE INDEX IF NOT EXISTS "audit_log_updated_at_idx" ON "payload"."audit_log" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "payload"."audit_log" USING btree ("created_at");
  `)

  // Migrate existing deletion audit log data to the new table
  await db.execute(sql`
  INSERT INTO "payload"."audit_log" (
    "action", "user_id", "user_email_hash", "performed_by_id", "timestamp",
    "ip_address", "ip_address_hash", "details", "updated_at", "created_at"
  )
  SELECT
    'account.deletion_executed',
    "deleted_user_id",
    "deleted_user_email_hash",
    "deleted_by_id",
    "deleted_at",
    NULL,
    "ip_address_hash",
    jsonb_build_object(
      'deletionType', "deletion_type",
      'deletionRequestedAt', "deletion_requested_at",
      'dataTransferred', "data_transferred",
      'dataDeleted', "data_deleted",
      'reason', "reason"
    ),
    "updated_at",
    "created_at"
  FROM "payload"."deletion_audit_log";
  `)

  // Drop old deletion_audit_log table and related objects
  await db.execute(sql`
  ALTER TABLE "payload"."deletion_audit_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."deletion_audit_log" CASCADE;
  DROP TYPE IF EXISTS "payload"."enum_deletion_audit_log_deletion_type";
  `)

  // Update payload_locked_documents_rels: swap deletion_audit_log_id for audit_log_id
  await db.execute(sql`
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "audit_log_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "payload"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_audit_log_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("audit_log_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "deletion_audit_log_id";
  `)

  // Create payload_kv table (new in this Payload version)
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "payload"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "payload_kv_key_idx" ON "payload"."payload_kv" USING btree ("key");
  `)

  // Add views branding domain indexes (detected by Payload schema diff)
  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "views_branding_branding_domain_idx" ON "payload"."views" USING btree ("branding_domain");
  CREATE INDEX IF NOT EXISTS "_views_v_version_branding_version_branding_domain_idx" ON "payload"."_views_v" USING btree ("version_branding_domain");
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Recreate deletion_audit_log
  await db.execute(sql`
  CREATE TYPE "payload"."enum_deletion_audit_log_deletion_type" AS ENUM('self', 'admin', 'scheduled');
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
  ALTER TABLE "payload"."deletion_audit_log" ADD CONSTRAINT "deletion_audit_log_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "deletion_audit_log_deleted_user_id_idx" ON "payload"."deletion_audit_log" USING btree ("deleted_user_id");
  CREATE INDEX "deletion_audit_log_deleted_at_idx" ON "payload"."deletion_audit_log" USING btree ("deleted_at");
  CREATE INDEX "deletion_audit_log_deleted_by_idx" ON "payload"."deletion_audit_log" USING btree ("deleted_by_id");
  CREATE INDEX "deletion_audit_log_updated_at_idx" ON "payload"."deletion_audit_log" USING btree ("updated_at");
  CREATE INDEX "deletion_audit_log_created_at_idx" ON "payload"."deletion_audit_log" USING btree ("created_at");
  `)

  // Migrate data back from audit_log to deletion_audit_log
  await db.execute(sql`
  INSERT INTO "payload"."deletion_audit_log" (
    "deleted_user_id", "deleted_user_email_hash", "deleted_by_id", "deleted_at",
    "deletion_type", "deletion_requested_at", "data_transferred", "data_deleted",
    "reason", "ip_address_hash", "updated_at", "created_at"
  )
  SELECT
    "user_id",
    "user_email_hash",
    "performed_by_id",
    "timestamp",
    (("details"->>'deletionType'))::payload.enum_deletion_audit_log_deletion_type,
    ("details"->>'deletionRequestedAt')::timestamp(3) with time zone,
    "details"->'dataTransferred',
    "details"->'dataDeleted',
    "details"->>'reason',
    "ip_address_hash",
    "updated_at",
    "created_at"
  FROM "payload"."audit_log"
  WHERE "action" = 'account.deletion_executed';
  `)

  // Drop audit_log and payload_kv
  await db.execute(sql`
  ALTER TABLE "payload"."audit_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."audit_log" CASCADE;
  ALTER TABLE "payload"."payload_kv" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."payload_kv" CASCADE;
  `)

  // Restore payload_locked_documents_rels columns
  await db.execute(sql`
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "deletion_audit_log_id" integer;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_deletion_audit_log_fk" FOREIGN KEY ("deletion_audit_log_id") REFERENCES "payload"."deletion_audit_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_deletion_audit_log_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("deletion_audit_log_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "audit_log_id";
  `)

  // Remove job slug from enums (recreate without the new value)
  await db.execute(sql`
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports', 'process-pending-retries', 'quota-reset', 'cache-cleanup', 'schema-maintenance', 'data-export', 'data-export-cleanup');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  `)

  // Drop views branding domain indexes
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload"."views_branding_branding_domain_idx";
  DROP INDEX IF EXISTS "payload"."_views_v_version_branding_version_branding_domain_idx";
  `)
}
