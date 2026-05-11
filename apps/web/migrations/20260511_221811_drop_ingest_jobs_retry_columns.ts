/**
 * Drop retry tracking columns from ingest_jobs.
 *
 * Commit `e7ad4fb8 fix(import): close quota and maintenance retry gaps`
 * removed `retry_attempts`, `last_retry_at`, `next_retry_at`, and
 * `last_successful_stage` from the collection definitions but no matching
 * migration was committed. This catch-up migration drops the unused columns
 * (and their dependent enum types) so the production schema matches the
 * code.
 *
 * @module
 * @category Migrations
 */
import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload"."ingest_jobs" DROP COLUMN IF EXISTS "retry_attempts";
    ALTER TABLE "payload"."ingest_jobs" DROP COLUMN IF EXISTS "last_retry_at";
    ALTER TABLE "payload"."ingest_jobs" DROP COLUMN IF EXISTS "next_retry_at";
    ALTER TABLE "payload"."ingest_jobs" DROP COLUMN IF EXISTS "last_successful_stage";
    ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN IF EXISTS "version_retry_attempts";
    ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN IF EXISTS "version_last_retry_at";
    ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN IF EXISTS "version_next_retry_at";
    ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN IF EXISTS "version_last_successful_stage";
    DROP TYPE IF EXISTS "payload"."enum_ingest_jobs_last_successful_stage";
    DROP TYPE IF EXISTS "payload"."enum__ingest_jobs_v_version_last_successful_stage";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "payload"."enum_ingest_jobs_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'create-schema-version', 'geocode-batch', 'create-events');
    CREATE TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'create-schema-version', 'geocode-batch', 'create-events');
    ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "retry_attempts" numeric DEFAULT 0;
    ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "last_retry_at" timestamp(3) with time zone;
    ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "next_retry_at" timestamp(3) with time zone;
    ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "last_successful_stage" "payload"."enum_ingest_jobs_last_successful_stage";
    ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_retry_attempts" numeric DEFAULT 0;
    ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_last_retry_at" timestamp(3) with time zone;
    ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_next_retry_at" timestamp(3) with time zone;
    ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_last_successful_stage" "payload"."enum__ingest_jobs_v_version_last_successful_stage";
  `);
}
