import { sql } from "@payloadcms/db-postgres";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_scheduled_imports_execution_history_status" ADD VALUE 'error';
  ALTER TYPE "payload"."enum__scheduled_imports_v_version_execution_history_status" ADD VALUE 'error';
  CREATE TABLE "payload"."scheduled_imports_multi_sheet_config_sheets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sheet_identifier" varchar,
  	"dataset_id" integer,
  	"skip_if_missing" boolean DEFAULT false
  );

  CREATE TABLE "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"sheet_identifier" varchar,
  	"dataset_id" integer,
  	"skip_if_missing" boolean DEFAULT false,
  	"_uuid" varchar
  );

  ALTER TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" CASCADE;
  DROP TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" CASCADE;
  ALTER TABLE "payload"."scheduled_imports" DROP CONSTRAINT "scheduled_imports_dataset_mapping_single_dataset_id_datasets_id_fk";

  ALTER TABLE "payload"."_scheduled_imports_v" DROP CONSTRAINT "_scheduled_imports_v_version_dataset_mapping_single_dataset_id_datasets_id_fk";

  ALTER TABLE "payload"."scheduled_imports" ALTER COLUMN "last_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum_scheduled_imports_last_status";
  CREATE TYPE "payload"."enum_scheduled_imports_last_status" AS ENUM('success', 'running', 'failed', 'error');
  ALTER TABLE "payload"."scheduled_imports" ALTER COLUMN "last_status" SET DATA TYPE "payload"."enum_scheduled_imports_last_status" USING "last_status"::"payload"."enum_scheduled_imports_last_status";
  ALTER TABLE "payload"."_scheduled_imports_v" ALTER COLUMN "version_last_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum__scheduled_imports_v_version_last_status";
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_last_status" AS ENUM('success', 'running', 'failed', 'error');
  ALTER TABLE "payload"."_scheduled_imports_v" ALTER COLUMN "version_last_status" SET DATA TYPE "payload"."enum__scheduled_imports_v_version_last_status" USING "version_last_status"::"payload"."enum__scheduled_imports_v_version_last_status";
  DROP INDEX "payload"."scheduled_imports_dataset_mapping_dataset_mapping_single_dataset_idx";
  DROP INDEX "payload"."_scheduled_imports_v_version_dataset_mapping_version_dataset_mapping_single_dataset_idx";
  ALTER TABLE "payload"."scheduled_imports_execution_history" ADD COLUMN "job_id" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "created_by_id" integer;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "auth_config_username" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "auth_config_password" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "dataset_id" integer;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "multi_sheet_config_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "retry_config_max_retries" numeric DEFAULT 3;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "retry_config_retry_delay_minutes" numeric DEFAULT 5;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "retry_config_backoff_multiplier" numeric DEFAULT 2;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_skip_duplicate_checking" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_auto_approve_schema" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_timeout_minutes" numeric DEFAULT 30;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_notify_on_error" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" ADD COLUMN "job_id" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_created_by_id" integer;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_auth_config_username" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_auth_config_password" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_dataset_id" integer;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_multi_sheet_config_enabled" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_retry_config_max_retries" numeric DEFAULT 3;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_retry_config_retry_delay_minutes" numeric DEFAULT 5;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_retry_config_backoff_multiplier" numeric DEFAULT 2;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_skip_duplicate_checking" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_auto_approve_schema" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_timeout_minutes" numeric DEFAULT 30;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_notify_on_error" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports_multi_sheet_config_sheets" ADD CONSTRAINT "scheduled_imports_multi_sheet_config_sheets_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_imports_multi_sheet_config_sheets" ADD CONSTRAINT "scheduled_imports_multi_sheet_config_sheets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."scheduled_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" ADD CONSTRAINT "_scheduled_imports_v_version_multi_sheet_config_sheets_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" ADD CONSTRAINT "_scheduled_imports_v_version_multi_sheet_config_sheets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_scheduled_imports_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "scheduled_imports_multi_sheet_config_sheets_order_idx" ON "payload"."scheduled_imports_multi_sheet_config_sheets" USING btree ("_order");
  CREATE INDEX "scheduled_imports_multi_sheet_config_sheets_parent_id_idx" ON "payload"."scheduled_imports_multi_sheet_config_sheets" USING btree ("_parent_id");
  CREATE INDEX "scheduled_imports_multi_sheet_config_sheets_dataset_idx" ON "payload"."scheduled_imports_multi_sheet_config_sheets" USING btree ("dataset_id");
  CREATE INDEX "_scheduled_imports_v_version_multi_sheet_config_sheets_order_idx" ON "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" USING btree ("_order");
  CREATE INDEX "_scheduled_imports_v_version_multi_sheet_config_sheets_parent_id_idx" ON "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" USING btree ("_parent_id");
  CREATE INDEX "_scheduled_imports_v_version_multi_sheet_config_sheets_dataset_idx" ON "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" USING btree ("dataset_id");
  ALTER TABLE "payload"."scheduled_imports" ADD CONSTRAINT "scheduled_imports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_imports" ADD CONSTRAINT "scheduled_imports_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD CONSTRAINT "_scheduled_imports_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD CONSTRAINT "_scheduled_imports_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "scheduled_imports_created_by_idx" ON "payload"."scheduled_imports" USING btree ("created_by_id");
  CREATE INDEX "scheduled_imports_dataset_idx" ON "payload"."scheduled_imports" USING btree ("dataset_id");
  CREATE INDEX "_scheduled_imports_v_version_version_created_by_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_created_by_id");
  CREATE INDEX "_scheduled_imports_v_version_version_dataset_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_dataset_id");
  ALTER TABLE "payload"."scheduled_imports_execution_history" DROP COLUMN "import_file_id";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "auth_config_basic_username";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "auth_config_basic_password";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "auth_config_custom_headers";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "dataset_mapping_mapping_type";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "dataset_mapping_single_dataset_id";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "max_retries";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "retry_delay_minutes";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "timeout_seconds";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_config_skip_duplicate_check";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_config_expected_content_type";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_config_max_file_size";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "metadata";
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" DROP COLUMN "import_file_id";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_auth_config_basic_username";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_auth_config_basic_password";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_auth_config_custom_headers";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_dataset_mapping_mapping_type";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_dataset_mapping_single_dataset_id";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_max_retries";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_retry_delay_minutes";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_timeout_seconds";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_config_skip_duplicate_check";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_config_expected_content_type";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_config_max_file_size";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_metadata";
  DROP TYPE "payload"."enum_scheduled_imports_dataset_mapping_mapping_type";
  DROP TYPE "payload"."exp_content_type";
  DROP TYPE "payload"."enum__scheduled_imports_v_version_dataset_mapping_mapping_type";`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_scheduled_imports_dataset_mapping_mapping_type" AS ENUM('auto', 'single', 'multiple');
  CREATE TYPE "payload"."exp_content_type" AS ENUM('auto', 'csv', 'json', 'xls', 'xlsx');
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_dataset_mapping_mapping_type" AS ENUM('auto', 'single', 'multiple');
  CREATE TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"sheet_identifier" varchar,
  	"dataset_id" integer,
  	"skip_if_missing" boolean DEFAULT false
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

  ALTER TABLE "payload"."scheduled_imports_multi_sheet_config_sheets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."scheduled_imports_multi_sheet_config_sheets" CASCADE;
  DROP TABLE "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" CASCADE;
  ALTER TABLE "payload"."scheduled_imports" DROP CONSTRAINT "scheduled_imports_created_by_id_users_id_fk";

  ALTER TABLE "payload"."scheduled_imports" DROP CONSTRAINT "scheduled_imports_dataset_id_datasets_id_fk";

  ALTER TABLE "payload"."_scheduled_imports_v" DROP CONSTRAINT "_scheduled_imports_v_version_created_by_id_users_id_fk";

  ALTER TABLE "payload"."_scheduled_imports_v" DROP CONSTRAINT "_scheduled_imports_v_version_dataset_id_datasets_id_fk";

  ALTER TABLE "payload"."scheduled_imports_execution_history" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "payload"."enum_scheduled_imports_execution_history_status";
  CREATE TYPE "payload"."enum_scheduled_imports_execution_history_status" AS ENUM('success', 'failed');
  ALTER TABLE "payload"."scheduled_imports_execution_history" ALTER COLUMN "status" SET DATA TYPE "payload"."enum_scheduled_imports_execution_history_status" USING "status"::"payload"."enum_scheduled_imports_execution_history_status";
  ALTER TABLE "payload"."scheduled_imports" ALTER COLUMN "last_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum_scheduled_imports_last_status";
  CREATE TYPE "payload"."enum_scheduled_imports_last_status" AS ENUM('success', 'failed', 'running');
  ALTER TABLE "payload"."scheduled_imports" ALTER COLUMN "last_status" SET DATA TYPE "payload"."enum_scheduled_imports_last_status" USING "last_status"::"payload"."enum_scheduled_imports_last_status";
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "payload"."enum__scheduled_imports_v_version_execution_history_status";
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_execution_history_status" AS ENUM('success', 'failed');
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" ALTER COLUMN "status" SET DATA TYPE "payload"."enum__scheduled_imports_v_version_execution_history_status" USING "status"::"payload"."enum__scheduled_imports_v_version_execution_history_status";
  ALTER TABLE "payload"."_scheduled_imports_v" ALTER COLUMN "version_last_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum__scheduled_imports_v_version_last_status";
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_last_status" AS ENUM('success', 'failed', 'running');
  ALTER TABLE "payload"."_scheduled_imports_v" ALTER COLUMN "version_last_status" SET DATA TYPE "payload"."enum__scheduled_imports_v_version_last_status" USING "version_last_status"::"payload"."enum__scheduled_imports_v_version_last_status";
  DROP INDEX "payload"."scheduled_imports_created_by_idx";
  DROP INDEX "payload"."scheduled_imports_dataset_idx";
  DROP INDEX "payload"."_scheduled_imports_v_version_version_created_by_idx";
  DROP INDEX "payload"."_scheduled_imports_v_version_version_dataset_idx";
  ALTER TABLE "payload"."scheduled_imports_execution_history" ADD COLUMN "import_file_id" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "auth_config_basic_username" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "auth_config_basic_password" varchar;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "auth_config_custom_headers" jsonb;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "dataset_mapping_mapping_type" "payload"."enum_scheduled_imports_dataset_mapping_mapping_type" DEFAULT 'auto';
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "dataset_mapping_single_dataset_id" integer;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "max_retries" numeric DEFAULT 3;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "retry_delay_minutes" numeric DEFAULT 5;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "timeout_seconds" numeric DEFAULT 300;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_config_skip_duplicate_check" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_config_expected_content_type" "payload"."exp_content_type" DEFAULT 'auto';
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_config_max_file_size" numeric DEFAULT 100;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "metadata" jsonb;
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" ADD COLUMN "import_file_id" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_auth_config_basic_username" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_auth_config_basic_password" varchar;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_auth_config_custom_headers" jsonb;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_dataset_mapping_mapping_type" "payload"."enum__scheduled_imports_v_version_dataset_mapping_mapping_type" DEFAULT 'auto';
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_dataset_mapping_single_dataset_id" integer;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_max_retries" numeric DEFAULT 3;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_retry_delay_minutes" numeric DEFAULT 5;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_timeout_seconds" numeric DEFAULT 300;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_config_skip_duplicate_check" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_config_expected_content_type" "payload"."exp_content_type" DEFAULT 'auto';
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_config_max_file_size" numeric DEFAULT 100;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_metadata" jsonb;
  ALTER TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" ADD CONSTRAINT "scheduled_imports_dataset_mapping_sheet_mappings_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."scheduled_imports_dataset_mapping_sheet_mappings" ADD CONSTRAINT "scheduled_imports_dataset_mapping_sheet_mappings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."scheduled_imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" ADD CONSTRAINT "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" ADD CONSTRAINT "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_scheduled_imports_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "scheduled_imports_dataset_mapping_sheet_mappings_order_idx" ON "payload"."scheduled_imports_dataset_mapping_sheet_mappings" USING btree ("_order");
  CREATE INDEX "scheduled_imports_dataset_mapping_sheet_mappings_parent_id_idx" ON "payload"."scheduled_imports_dataset_mapping_sheet_mappings" USING btree ("_parent_id");
  CREATE INDEX "scheduled_imports_dataset_mapping_sheet_mappings_dataset_idx" ON "payload"."scheduled_imports_dataset_mapping_sheet_mappings" USING btree ("dataset_id");
  CREATE INDEX "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_order_idx" ON "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" USING btree ("_order");
  CREATE INDEX "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_parent_id_idx" ON "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" USING btree ("_parent_id");
  CREATE INDEX "_scheduled_imports_v_version_dataset_mapping_sheet_mappings_dataset_idx" ON "payload"."_scheduled_imports_v_version_dataset_mapping_sheet_mappings" USING btree ("dataset_id");
  ALTER TABLE "payload"."scheduled_imports" ADD CONSTRAINT "scheduled_imports_dataset_mapping_single_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_mapping_single_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD CONSTRAINT "_scheduled_imports_v_version_dataset_mapping_single_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_mapping_single_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "scheduled_imports_dataset_mapping_dataset_mapping_single_dataset_idx" ON "payload"."scheduled_imports" USING btree ("dataset_mapping_single_dataset_id");
  CREATE INDEX "_scheduled_imports_v_version_dataset_mapping_version_dataset_mapping_single_dataset_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_dataset_mapping_single_dataset_id");
  ALTER TABLE "payload"."scheduled_imports_execution_history" DROP COLUMN "job_id";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "created_by_id";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "auth_config_username";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "auth_config_password";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "dataset_id";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "multi_sheet_config_enabled";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "retry_config_max_retries";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "retry_config_retry_delay_minutes";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "retry_config_backoff_multiplier";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_skip_duplicate_checking";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_auto_approve_schema";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_timeout_minutes";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_notify_on_error";
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" DROP COLUMN "job_id";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_created_by_id";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_auth_config_username";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_auth_config_password";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_dataset_id";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_multi_sheet_config_enabled";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_retry_config_max_retries";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_retry_config_retry_delay_minutes";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_retry_config_backoff_multiplier";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_skip_duplicate_checking";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_auto_approve_schema";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_timeout_minutes";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_notify_on_error";`);
}
