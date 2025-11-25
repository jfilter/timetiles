import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."user_usage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"url_fetches_today" numeric DEFAULT 0,
  	"file_uploads_today" numeric DEFAULT 0,
  	"import_jobs_today" numeric DEFAULT 0,
  	"current_active_schedules" numeric DEFAULT 0,
  	"total_events_created" numeric DEFAULT 0,
  	"current_catalogs" numeric DEFAULT 0,
  	"last_reset_date" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload"."_users_v_version_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_users_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."_users_v_version_sessions" CASCADE;
  DROP TABLE "payload"."_users_v" CASCADE;
  DROP INDEX "payload"."users__status_idx";
  ALTER TABLE "payload"."users_sessions" ALTER COLUMN "expires_at" SET NOT NULL;
  ALTER TABLE "payload"."users" ALTER COLUMN "trust_level" SET NOT NULL;
  ALTER TABLE "payload"."users" ALTER COLUMN "email" SET NOT NULL;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "user_usage_id" integer;
  ALTER TABLE "payload"."user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "user_usage_user_idx" ON "payload"."user_usage" USING btree ("user_id");
  CREATE INDEX "user_usage_last_reset_date_idx" ON "payload"."user_usage" USING btree ("last_reset_date");
  CREATE INDEX "user_usage_updated_at_idx" ON "payload"."user_usage" USING btree ("updated_at");
  CREATE INDEX "user_usage_created_at_idx" ON "payload"."user_usage" USING btree ("created_at");
  CREATE INDEX "user_usage_deleted_at_idx" ON "payload"."user_usage" USING btree ("deleted_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_usage_fk" FOREIGN KEY ("user_usage_id") REFERENCES "payload"."user_usage"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_user_usage_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("user_usage_id");
  ALTER TABLE "payload"."users" DROP COLUMN "_status";
  DROP TYPE "payload"."enum_users_status";
  DROP TYPE "payload"."enum__users_v_version_role";
  DROP TYPE "payload"."enum__users_v_version_registration_source";
  DROP TYPE "payload"."enum__users_v_version_trust_level";
  DROP TYPE "payload"."enum__users_v_version_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_users_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__users_v_version_role" AS ENUM('user', 'admin', 'editor');
  CREATE TYPE "payload"."enum__users_v_version_registration_source" AS ENUM('admin', 'self');
  CREATE TYPE "payload"."enum__users_v_version_trust_level" AS ENUM('0', '1', '2', '3', '4', '5');
  CREATE TYPE "payload"."enum__users_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "payload"."_users_v_version_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload"."_users_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_first_name" varchar,
  	"version_last_name" varchar,
  	"version_role" "payload"."enum__users_v_version_role" DEFAULT 'user',
  	"version_is_active" boolean DEFAULT true,
  	"version_last_login_at" timestamp(3) with time zone,
  	"version_registration_source" "payload"."enum__users_v_version_registration_source" DEFAULT 'admin',
  	"version_trust_level" "payload"."enum__users_v_version_trust_level" DEFAULT '2',
  	"version_quotas_max_active_schedules" numeric,
  	"version_quotas_max_url_fetches_per_day" numeric,
  	"version_quotas_max_file_uploads_per_day" numeric,
  	"version_quotas_max_events_per_import" numeric,
  	"version_quotas_max_total_events" numeric,
  	"version_quotas_max_import_jobs_per_day" numeric,
  	"version_quotas_max_file_size_m_b" numeric,
  	"version_quotas_max_catalogs_per_user" numeric,
  	"version_usage_current_active_schedules" numeric,
  	"version_usage_url_fetches_today" numeric,
  	"version_usage_file_uploads_today" numeric,
  	"version_usage_import_jobs_today" numeric,
  	"version_usage_total_events_created" numeric,
  	"version_usage_current_catalogs" numeric,
  	"version_usage_last_reset_date" timestamp(3) with time zone,
  	"version_custom_quotas" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__users_v_version_status" DEFAULT 'draft',
  	"version_email" varchar,
  	"version_reset_password_token" varchar,
  	"version_reset_password_expiration" timestamp(3) with time zone,
  	"version_salt" varchar,
  	"version_hash" varchar,
  	"version__verified" boolean,
  	"version__verificationtoken" varchar,
  	"version_login_attempts" numeric DEFAULT 0,
  	"version_lock_until" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  ALTER TABLE "payload"."user_usage" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."user_usage" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_user_usage_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_user_usage_id_idx";
  ALTER TABLE "payload"."users_sessions" ALTER COLUMN "expires_at" DROP NOT NULL;
  ALTER TABLE "payload"."users" ALTER COLUMN "trust_level" DROP NOT NULL;
  ALTER TABLE "payload"."users" ALTER COLUMN "email" DROP NOT NULL;
  ALTER TABLE "payload"."users" ADD COLUMN "_status" "payload"."enum_users_status" DEFAULT 'draft';
  ALTER TABLE "payload"."_users_v_version_sessions" ADD CONSTRAINT "_users_v_version_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_users_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_users_v" ADD CONSTRAINT "_users_v_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "_users_v_version_sessions_order_idx" ON "payload"."_users_v_version_sessions" USING btree ("_order");
  CREATE INDEX "_users_v_version_sessions_parent_id_idx" ON "payload"."_users_v_version_sessions" USING btree ("_parent_id");
  CREATE INDEX "_users_v_parent_idx" ON "payload"."_users_v" USING btree ("parent_id");
  CREATE INDEX "_users_v_version_version_updated_at_idx" ON "payload"."_users_v" USING btree ("version_updated_at");
  CREATE INDEX "_users_v_version_version_created_at_idx" ON "payload"."_users_v" USING btree ("version_created_at");
  CREATE INDEX "_users_v_version_version_deleted_at_idx" ON "payload"."_users_v" USING btree ("version_deleted_at");
  CREATE INDEX "_users_v_version_version__status_idx" ON "payload"."_users_v" USING btree ("version__status");
  CREATE INDEX "_users_v_version_version_email_idx" ON "payload"."_users_v" USING btree ("version_email");
  CREATE INDEX "_users_v_created_at_idx" ON "payload"."_users_v" USING btree ("created_at");
  CREATE INDEX "_users_v_updated_at_idx" ON "payload"."_users_v" USING btree ("updated_at");
  CREATE INDEX "_users_v_latest_idx" ON "payload"."_users_v" USING btree ("latest");
  CREATE INDEX "_users_v_autosave_idx" ON "payload"."_users_v" USING btree ("autosave");
  CREATE INDEX "users__status_idx" ON "payload"."users" USING btree ("_status");
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "user_usage_id";`)
}
