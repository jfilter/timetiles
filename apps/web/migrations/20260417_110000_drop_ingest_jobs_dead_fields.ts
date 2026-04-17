import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drop dead fields on `ingest_jobs` left over from the pre-workflow-migration
 * ErrorRecoveryService (removed in ADR 0030). Keeps `error_log` since the
 * current pipeline still writes that column via `failIngestJob()`.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
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
  DROP TYPE IF EXISTS "payload"."enum__ingest_jobs_v_version_last_successful_stage";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "payload"."enum_ingest_jobs_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'create-schema-version', 'geocode-batch', 'create-events');
  CREATE TYPE "payload"."enum__ingest_jobs_v_version_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'needs-review', 'create-schema-version', 'geocode-batch', 'create-events');
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN IF NOT EXISTS "retry_attempts" numeric;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN IF NOT EXISTS "last_retry_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN IF NOT EXISTS "last_successful_stage" "payload"."enum_ingest_jobs_last_successful_stage";
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN IF NOT EXISTS "version_retry_attempts" numeric;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN IF NOT EXISTS "version_last_retry_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN IF NOT EXISTS "version_next_retry_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN IF NOT EXISTS "version_last_successful_stage" "payload"."enum__ingest_jobs_v_version_last_successful_stage";`)
}
