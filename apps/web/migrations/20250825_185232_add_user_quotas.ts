import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Create ENUMs if they don't exist
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "payload"."enum_users_trust_level" AS ENUM('0', '1', '2', '3', '4', '5');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "payload"."enum__users_v_version_trust_level" AS ENUM('0', '1', '2', '3', '4', '5');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  // Add value to existing ENUMs if not already present
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TYPE "payload"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'quota-reset';
    EXCEPTION WHEN undefined_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TYPE "payload"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'quota-reset';
    EXCEPTION WHEN undefined_object THEN null;
    END $$;
  `);

  // Add columns to users table
  await db.execute(sql`
  ALTER TABLE "payload"."users" ADD COLUMN IF NOT EXISTS "trust_level" "payload"."enum_users_trust_level" DEFAULT '2';
  ALTER TABLE "payload"."users" ADD COLUMN IF NOT EXISTS "quotas_max_active_schedules" numeric DEFAULT 5;
  ALTER TABLE "payload"."users" ADD COLUMN "quotas_max_url_fetches_per_day" numeric DEFAULT 20;
  ALTER TABLE "payload"."users" ADD COLUMN "quotas_max_file_uploads_per_day" numeric DEFAULT 10;
  ALTER TABLE "payload"."users" ADD COLUMN "quotas_max_events_per_import" numeric DEFAULT 10000;
  ALTER TABLE "payload"."users" ADD COLUMN "quotas_max_total_events" numeric DEFAULT 50000;
  ALTER TABLE "payload"."users" ADD COLUMN "quotas_max_import_jobs_per_day" numeric DEFAULT 20;
  ALTER TABLE "payload"."users" ADD COLUMN "quotas_max_file_size_m_b" numeric DEFAULT 50;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_current_active_schedules" numeric DEFAULT 0;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_url_fetches_today" numeric DEFAULT 0;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_file_uploads_today" numeric DEFAULT 0;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_import_jobs_today" numeric DEFAULT 0;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_total_events_created" numeric DEFAULT 0;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_last_reset_date" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "custom_quotas" jsonb;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_trust_level" "payload"."enum__users_v_version_trust_level" DEFAULT '2';
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_quotas_max_active_schedules" numeric DEFAULT 5;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_quotas_max_url_fetches_per_day" numeric DEFAULT 20;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_quotas_max_file_uploads_per_day" numeric DEFAULT 10;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_quotas_max_events_per_import" numeric DEFAULT 10000;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_quotas_max_total_events" numeric DEFAULT 50000;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_quotas_max_import_jobs_per_day" numeric DEFAULT 20;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_quotas_max_file_size_m_b" numeric DEFAULT 50;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_usage_current_active_schedules" numeric DEFAULT 0;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_usage_url_fetches_today" numeric DEFAULT 0;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_usage_file_uploads_today" numeric DEFAULT 0;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_usage_import_jobs_today" numeric DEFAULT 0;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_usage_total_events_created" numeric DEFAULT 0;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_usage_last_reset_date" timestamp(3) with time zone;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_custom_quotas" jsonb;`);

  // Update existing users with default values based on their role
  await db.execute(sql`
    UPDATE "payload"."users"
    SET 
      "trust_level" = CASE 
        WHEN "role" = 'admin' THEN '5'::payload.enum_users_trust_level
        WHEN "role" = 'editor' THEN '3'::payload.enum_users_trust_level
        ELSE '2'::payload.enum_users_trust_level
      END,
      "quotas_max_active_schedules" = CASE 
        WHEN "role" = 'admin' THEN -1
        WHEN "role" = 'editor' THEN 20
        ELSE 5
      END,
      "quotas_max_url_fetches_per_day" = CASE 
        WHEN "role" = 'admin' THEN -1
        WHEN "role" = 'editor' THEN 100
        ELSE 20
      END,
      "quotas_max_file_uploads_per_day" = CASE 
        WHEN "role" = 'admin' THEN -1
        WHEN "role" = 'editor' THEN 50
        ELSE 10
      END,
      "quotas_max_events_per_import" = CASE 
        WHEN "role" = 'admin' THEN -1
        WHEN "role" = 'editor' THEN 50000
        ELSE 10000
      END,
      "quotas_max_total_events" = CASE 
        WHEN "role" = 'admin' THEN -1
        WHEN "role" = 'editor' THEN 500000
        ELSE 50000
      END,
      "quotas_max_import_jobs_per_day" = CASE 
        WHEN "role" = 'admin' THEN -1
        WHEN "role" = 'editor' THEN 100
        ELSE 20
      END,
      "quotas_max_file_size_m_b" = CASE 
        WHEN "role" = 'admin' THEN 1000
        WHEN "role" = 'editor' THEN 100
        ELSE 50
      END,
      "usage_last_reset_date" = CURRENT_TIMESTAMP
    WHERE "trust_level" IS NULL
  `);

  // Count existing active schedules for each user if the table exists
  const scheduledImportsExists = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 
      FROM information_schema.tables 
      WHERE table_schema = 'payload' 
      AND table_name = 'scheduled_imports'
    ) as exists
  `);

  if (scheduledImportsExists.rows[0]?.exists) {
    const hasCreatedBy = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'payload' 
        AND table_name = 'scheduled_imports'
        AND column_name = 'created_by_id'
      ) as exists
    `);

    if (hasCreatedBy.rows[0]?.exists) {
      await db.execute(sql`
        UPDATE "payload"."users" u
        SET "usage_current_active_schedules" = (
          SELECT COUNT(*)
          FROM "payload"."scheduled_imports" si
          WHERE si."created_by_id" = u."id" AND si."enabled" = true
        )
      `);
    }
  }

  // User permission and quota fields added successfully
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports');
  ALTER TABLE "payload"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_log_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'create-schema-version', 'geocode-batch', 'create-events', 'cleanup-approval-locks', 'url-fetch', 'schedule-manager', 'cleanup-stuck-scheduled-imports');
  ALTER TABLE "payload"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "payload"."enum_payload_jobs_task_slug" USING "task_slug"::"payload"."enum_payload_jobs_task_slug";
  ALTER TABLE "payload"."users" DROP COLUMN "trust_level";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_active_schedules";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_url_fetches_per_day";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_file_uploads_per_day";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_events_per_import";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_total_events";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_import_jobs_per_day";
  ALTER TABLE "payload"."users" DROP COLUMN "quotas_max_file_size_m_b";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_current_active_schedules";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_url_fetches_today";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_file_uploads_today";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_import_jobs_today";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_total_events_created";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_last_reset_date";
  ALTER TABLE "payload"."users" DROP COLUMN "custom_quotas";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_trust_level";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_quotas_max_active_schedules";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_quotas_max_url_fetches_per_day";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_quotas_max_file_uploads_per_day";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_quotas_max_events_per_import";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_quotas_max_total_events";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_quotas_max_import_jobs_per_day";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_quotas_max_file_size_m_b";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_usage_current_active_schedules";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_usage_url_fetches_today";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_usage_file_uploads_today";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_usage_import_jobs_today";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_usage_total_events_created";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_usage_last_reset_date";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_custom_quotas";
  DROP TYPE "payload"."enum_users_trust_level";
  DROP TYPE "payload"."enum__users_v_version_trust_level";`);
}
