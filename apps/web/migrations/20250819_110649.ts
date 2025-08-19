import { sql } from "@payloadcms/db-postgres";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
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
  ALTER TABLE "payload"."scheduled_imports" ALTER COLUMN "statistics_average_duration" SET DEFAULT 0;
  ALTER TABLE "payload"."_scheduled_imports_v" ALTER COLUMN "version_statistics_average_duration" SET DEFAULT 0;
  ALTER TABLE "payload"."scheduled_imports_execution_history" ADD COLUMN "records_imported" numeric;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "auth_config_custom_headers" jsonb;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "retry_config_exponential_backoff" boolean DEFAULT true;
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" ADD COLUMN "records_imported" numeric;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_auth_config_custom_headers" jsonb;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_retry_config_exponential_backoff" boolean DEFAULT true;
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "retry_config_backoff_multiplier";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "advanced_options_notify_on_error";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_retry_config_backoff_multiplier";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_advanced_options_notify_on_error";`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_scheduled_imports_execution_history_status" ADD VALUE 'error';
  ALTER TYPE "payload"."enum__scheduled_imports_v_version_execution_history_status" ADD VALUE 'error';
  ALTER TABLE "payload"."scheduled_imports" ALTER COLUMN "last_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum_scheduled_imports_last_status";
  CREATE TYPE "payload"."enum_scheduled_imports_last_status" AS ENUM('success', 'running', 'failed', 'error');
  ALTER TABLE "payload"."scheduled_imports" ALTER COLUMN "last_status" SET DATA TYPE "payload"."enum_scheduled_imports_last_status" USING "last_status"::"payload"."enum_scheduled_imports_last_status";
  ALTER TABLE "payload"."_scheduled_imports_v" ALTER COLUMN "version_last_status" SET DATA TYPE text;
  DROP TYPE "payload"."enum__scheduled_imports_v_version_last_status";
  CREATE TYPE "payload"."enum__scheduled_imports_v_version_last_status" AS ENUM('success', 'running', 'failed', 'error');
  ALTER TABLE "payload"."_scheduled_imports_v" ALTER COLUMN "version_last_status" SET DATA TYPE "payload"."enum__scheduled_imports_v_version_last_status" USING "version_last_status"::"payload"."enum__scheduled_imports_v_version_last_status";
  ALTER TABLE "payload"."scheduled_imports" ALTER COLUMN "statistics_average_duration" DROP DEFAULT;
  ALTER TABLE "payload"."_scheduled_imports_v" ALTER COLUMN "version_statistics_average_duration" DROP DEFAULT;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "retry_config_backoff_multiplier" numeric DEFAULT 2;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "advanced_options_notify_on_error" boolean DEFAULT false;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_retry_config_backoff_multiplier" numeric DEFAULT 2;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_advanced_options_notify_on_error" boolean DEFAULT false;
  ALTER TABLE "payload"."scheduled_imports_execution_history" DROP COLUMN "records_imported";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "auth_config_custom_headers";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "retry_config_exponential_backoff";
  ALTER TABLE "payload"."_scheduled_imports_v_version_execution_history" DROP COLUMN "records_imported";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_auth_config_custom_headers";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_retry_config_exponential_backoff";`);
}
