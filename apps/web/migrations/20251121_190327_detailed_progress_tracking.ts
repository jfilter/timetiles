import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   -- Drop old progress columns
   ALTER TABLE "payload"."import_jobs" DROP COLUMN IF EXISTS "progress_current";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN IF EXISTS "progress_total";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN IF EXISTS "progress_batch_number";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN IF EXISTS "version_progress_current";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN IF EXISTS "version_progress_total";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN IF EXISTS "version_progress_batch_number";

  -- Add new progress columns
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "progress_stages" jsonb;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "progress_overall_percentage" numeric DEFAULT 0;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "progress_estimated_completion_time" timestamp(3) with time zone;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_progress_stages" jsonb;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_progress_overall_percentage" numeric DEFAULT 0;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_progress_estimated_completion_time" timestamp(3) with time zone;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   -- Drop new progress columns
   ALTER TABLE "payload"."import_jobs" DROP COLUMN IF EXISTS "progress_stages";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN IF EXISTS "progress_overall_percentage";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN IF EXISTS "progress_estimated_completion_time";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN IF EXISTS "version_progress_stages";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN IF EXISTS "version_progress_overall_percentage";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN IF EXISTS "version_progress_estimated_completion_time";

  -- Restore old progress columns
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "progress_current" numeric DEFAULT 0;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "progress_total" numeric;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "progress_batch_number" numeric DEFAULT 0;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_progress_current" numeric DEFAULT 0;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_progress_total" numeric;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_progress_batch_number" numeric DEFAULT 0;`);
}
