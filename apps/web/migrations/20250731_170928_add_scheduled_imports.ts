import { sql } from "@payloadcms/db-postgres";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_scheduled_imports_execution_history_status" AS ENUM('success', 'failed');
  CREATE TYPE "payload"."enum_scheduled_imports_auth_config_type" AS ENUM('none', 'api-key', 'bearer', 'basic');
  CREATE TYPE "payload"."enum_scheduled_imports_dataset_mapping_mapping_type" AS ENUM('auto', 'single', 'multiple');
  CREATE TYPE "payload"."enum_scheduled_imports_schedule_type" AS ENUM('frequency', 'cron');
  CREATE TYPE "payload"."enum_scheduled_imports_frequency" AS ENUM('hourly', 'daily', 'weekly', 'monthly');
  CREATE TYPE "payload"."enum_scheduled_imports_last_status" AS ENUM('success', 'failed', 'running');
  CREATE TYPE "payload"."exp_content_type" AS ENUM('auto', 'csv', 'json', 'xls', 'xlsx');
  CREATE TYPE "payload"."enum_scheduled_imports_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_execution_history_status" AS ENUM('success', 'failed');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_auth_config_type" AS ENUM('none', 'api-key', 'bearer', 'basic');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_dataset_mapping_mapping_type" AS ENUM('auto', 'single', 'multiple');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_schedule_type" AS ENUM('frequency', 'cron');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_frequency" AS ENUM('hourly', 'daily', 'weekly', 'monthly');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_last_status" AS ENUM('success', 'failed', 'running');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_status" AS ENUM('draft', 'published');
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'url-fetch';
  ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'schedule-manager';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'url-fetch';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'schedule-manager';
  CREATE TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sheet_identifier" varchar,
  	"dataset_id" integer,
  	"skip_if_missing" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."scheduled_imports_execution_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone,
  	"status" "payload"."enum_scheduled_imports_execution_history_status",
  	"import_file_id" varchar,
  	"error" varchar,
  	"duration" numeric
  );
  
  CREATE TABLE "payload"."scheduled_imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" varchar,
  	"enabled" boolean DEFAULT true,
  	"source_url" varchar,
  	"auth_config_type" "payload"."enum_scheduled_imports_auth_config_type" DEFAULT 'none',
  	"auth_config_api_key" varchar,
  	"auth_config_api_key_header" varchar DEFAULT 'X-API-Key',
  	"auth_config_bearer_token" varchar,
  	"auth_config_basic_username" varchar,
  	"auth_config_basic_password" varchar,
  	"auth_config_custom_headers" jsonb,
  	"catalog_id" integer,
  	"dataset_mapping_mapping_type" "payload"."enum_scheduled_imports_dataset_mapping_mapping_type" DEFAULT 'auto',
  	"dataset_mapping_single_dataset_id" integer,
  	"import_name_template" varchar DEFAULT '{{name}} - {{date}}',
  	"schedule_type" "payload"."enum_scheduled_imports_schedule_type" DEFAULT 'frequency',
  	"frequency" "payload"."enum_scheduled_imports_frequency",
  	"cron_expression" varchar,
  	"max_retries" numeric DEFAULT 3,
  	"retry_delay_minutes" numeric DEFAULT 5,
  	"timeout_seconds" numeric DEFAULT 300,
  	"last_run" timestamp(3) with time zone,
  	"next_run" timestamp(3) with time zone,
  	"last_status" "payload"."enum_scheduled_imports_last_status",
  	"last_error" varchar,
  	"current_retries" numeric DEFAULT 0,
  	"statistics_total_runs" numeric DEFAULT 0,
  	"statistics_successful_runs" numeric DEFAULT 0,
  	"statistics_failed_runs" numeric DEFAULT 0,
  	"statistics_average_duration" numeric,
  	"advanced_config_skip_duplicate_check" boolean DEFAULT false,
  	"advanced_config_expected_content_type" "payload"."exp_content_type" DEFAULT 'auto',
  	"advanced_config_max_file_size" numeric DEFAULT 100,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_scheduled_imports_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"sheet_identifier" varchar,
  	"dataset_id" integer,
  	"skip_if_missing" boolean DEFAULT false,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_scheduled_imports_v_version_execution_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone,
  	"status" "payload"."enum__scheduled_imports_v_version_execution_history_status",
  	"import_file_id" varchar,
  	"error" varchar,
  	"duration" numeric,
  	"_uuid" varchar
  );
  
  CREATE TABLE "payload"."_scheduled_imports_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_description" varchar,
  	"version_enabled" boolean DEFAULT true,
  	"version_source_url" varchar,
  	"version_auth_config_type" "payload"."enum__scheduled_imports_v_version_auth_config_type" DEFAULT 'none',
  	"version_auth_config_api_key" varchar,
  	"version_auth_config_api_key_header" varchar DEFAULT 'X-API-Key',
  	"version_auth_config_bearer_token" varchar,
  	"version_auth_config_basic_username" varchar,
  	"version_auth_config_basic_password" varchar,
  	"version_auth_config_custom_headers" jsonb,
  	"version_catalog_id" integer,
  	"version_dataset_mapping_mapping_type" "payload"."enum__scheduled_imports_v_version_dataset_mapping_mapping_type" DEFAULT 'auto',
  	"version_dataset_mapping_single_dataset_id" integer,
  	"version_import_name_template" varchar DEFAULT '{{name}} - {{date}}',
  	"version_schedule_type" "payload"."enum__scheduled_imports_v_version_schedule_type" DEFAULT 'frequency',
  	"version_frequency" "payload"."enum__scheduled_imports_v_version_frequency",
  	"version_cron_expression" varchar,
  	"version_max_retries" numeric DEFAULT 3,
  	"version_retry_delay_minutes" numeric DEFAULT 5,
  	"version_timeout_seconds" numeric DEFAULT 300,
  	"version_last_run" timestamp(3) with time zone,
  	"version_next_run" timestamp(3) with time zone,
  	"version_last_status" "payload"."enum__scheduled_imports_v_version_last_status",
  	"version_last_error" varchar,
  	"version_current_retries" numeric DEFAULT 0,
  	"version_statistics_total_runs" numeric DEFAULT 0,
  	"version_statistics_successful_runs" numeric DEFAULT 0,
  	"version_statistics_failed_runs" numeric DEFAULT 0,
  	"version_statistics_average_duration" numeric,
  	"version_advanced_config_skip_duplicate_check" boolean DEFAULT false,
  	"version_advanced_config_expected_content_type" "payload"."exp_content_type" DEFAULT 'auto',
  	"version_advanced_config_max_file_size" numeric DEFAULT 100,
  	"version_metadata" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__scheduled_imports_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "scheduled_imports_id" integer;
  ALTER TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" ADD CONSTRAINT "scheduled_imports_dataset_mapping_sheet_mappings_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" ADD CONSTRAINT "scheduled_imports_dataset_mapping_sheet_mappings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."scheduled_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_imports_execution_history" ADD CONSTRAINT "scheduled_imports_execution_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."scheduled_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_imports" ADD CONSTRAINT "scheduled_imports_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_imports" ADD CONSTRAINT "scheduled_imports_dataset_mapping_single_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_mapping_single_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" ADD CONSTRAINT "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" ADD CONSTRAINT "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_scheduled_imports_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" ADD CONSTRAINT "_scheduled_imports_v_version_execution_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_scheduled_imports_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD CONSTRAINT "_scheduled_imports_v_parent_id_scheduled_imports_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."scheduled_imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD CONSTRAINT "_scheduled_imports_v_version_catalog_id_catalogs_id_fk" FOREIGN KEY ("version_catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD CONSTRAINT "_scheduled_imports_v_version_dataset_mapping_single_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_mapping_single_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "scheduled_imports_dataset_mapping_sheet_mappings_order_idx" ON "payload"."scheduled_imports_dataset_mapping_sheet_mappings" USING btree ("_order");
  CREATE INDEX "scheduled_imports_dataset_mapping_sheet_mappings_parent_id_idx" ON "payload"."scheduled_imports_dataset_mapping_sheet_mappings" USING btree ("_parent_id");
  CREATE INDEX "scheduled_imports_dataset_mapping_sheet_mappings_dataset_idx" ON "payload"."scheduled_imports_dataset_mapping_sheet_mappings" USING btree ("dataset_id");
  CREATE INDEX "scheduled_imports_execution_history_order_idx" ON "payload"."scheduled_imports_execution_history" USING btree ("_order");
  CREATE INDEX "scheduled_imports_execution_history_parent_id_idx" ON "payload"."scheduled_imports_execution_history" USING btree ("_parent_id");
  CREATE INDEX "scheduled_imports_catalog_idx" ON "payload"."scheduled_imports" USING btree ("catalog_id");
  CREATE INDEX "scheduled_imports_dataset_mapping_dataset_mapping_single_dataset_idx" ON "payload"."scheduled_imports" USING btree ("dataset_mapping_single_dataset_id");
  CREATE INDEX "scheduled_imports_updated_at_idx" ON "payload"."scheduled_imports" USING btree ("updated_at");
  CREATE INDEX "scheduled_imports_created_at_idx" ON "payload"."scheduled_imports" USING btree ("created_at");
  CREATE INDEX "scheduled_imports__status_idx" ON "payload"."scheduled_imports" USING btree ("_status");
  CREATE INDEX "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_order_idx" ON "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" USING btree ("_order");
  CREATE INDEX "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_parent_id_idx" ON "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" USING btree ("_parent_id");
  CREATE INDEX "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_dataset_idx" ON "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" USING btree ("dataset_id");
  CREATE INDEX "_scheduled_imports_v_version_execution_history_order_idx" ON "payload"."_scheduled_imports_v_version_execution_history" USING btree ("_order");
  CREATE INDEX "_scheduled_imports_v_version_execution_history_parent_id_idx" ON "payload"."_scheduled_imports_v_version_execution_history" USING btree ("_parent_id");
  CREATE INDEX "_scheduled_imports_v_parent_idx" ON "payload"."_scheduled_imports_v" USING btree ("parent_id");
  CREATE INDEX "_scheduled_imports_v_version_version_catalog_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_catalog_id");
  CREATE INDEX "_scheduled_imports_v_version_dataset_mapping_version_dataset_mapping_single_dataset_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_dataset_mapping_single_dataset_id");
  CREATE INDEX "_scheduled_imports_v_version_version_updated_at_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_updated_at");
  CREATE INDEX "_scheduled_imports_v_version_version_created_at_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_created_at");
  CREATE INDEX "_scheduled_imports_v_version_version__status_idx" ON "payload"."_scheduled_imports_v" USING btree ("version__status");
  CREATE INDEX "_scheduled_imports_v_created_at_idx" ON "payload"."_scheduled_imports_v" USING btree ("created_at");
  CREATE INDEX "_scheduled_imports_v_updated_at_idx" ON "payload"."_scheduled_imports_v" USING btree ("updated_at");
  CREATE INDEX "_scheduled_imports_v_latest_idx" ON "payload"."_scheduled_imports_v" USING btree ("latest");
  CREATE INDEX "_scheduled_imports_v_autosave_idx" ON "payload"."_scheduled_imports_v" USING btree ("autosave");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scheduled_imports_fk" FOREIGN KEY ("scheduled_imports_id") REFERENCES "payload"."scheduled_imports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_scheduled_imports_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("scheduled_imports_id");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."scheduled_imports_execution_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."scheduled_imports" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_scheduled_imports_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" CASCADE;
  DROP TABLE "payload"."scheduled_imports_execution_history" CASCADE;
  DROP TABLE "payload"."scheduled_imports" CASCADE;
  DROP TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" CASCADE;
  DROP TABLE "payload"."_scheduled_imports_v_version_execution_history" CASCADE;
  DROP TABLE "payload"."_scheduled_imports_v" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_scheduled_imports_fk";
  
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  DROP INDEX "payload"."payload_locked_documents_rels_scheduled_imports_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "scheduled_imports_id";
  DROP TYPE "payload"."enum_scheduled_imports_execution_history_status";
  DROP TYPE "payload"."enum_scheduled_imports_auth_config_type";
  DROP TYPE "payload"."enum_scheduled_imports_dataset_mapping_mapping_type";
  DROP TYPE "payload"."enum_scheduled_imports_schedule_type";
  DROP TYPE "payload"."enum_scheduled_imports_frequency";
  DROP TYPE "payload"."enum_scheduled_imports_last_status";
  DROP TYPE "payload"."exp_content_type";
  DROP TYPE "payload"."enum_scheduled_imports_status";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_execution_history_status";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_auth_config_type";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_dataset_mapping_mapping_type";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_schedule_type";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_frequency";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_last_status";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_status";`);
}
