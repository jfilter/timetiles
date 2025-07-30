import { sql } from "@payloadcms/db-postgres";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE 'create-schema-version' BEFORE 'geocode-batch';
  ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE 'create-schema-version' BEFORE 'geocode-batch';
  ALTER TABLE "payload"."import_files" DROP COLUMN "file_name";
  ALTER TABLE "payload"."import_files" DROP COLUMN "file_size";
  ALTER TABLE "payload"."_import_files_v" DROP COLUMN "version_file_name";
  ALTER TABLE "payload"."_import_files_v" DROP COLUMN "version_file_size";`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'geocode-batch', 'create-events', 'cleanup-approval-locks');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'geocode-batch', 'create-events', 'cleanup-approval-locks');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."import_files" ADD COLUMN "file_name" varchar NOT NULL;
  ALTER TABLE "payload"."import_files" ADD COLUMN "file_size" numeric;
  ALTER TABLE "payload"."_import_files_v" ADD COLUMN "version_file_name" varchar NOT NULL;
  ALTER TABLE "payload"."_import_files_v" ADD COLUMN "version_file_size" numeric;`);
}
