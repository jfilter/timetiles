/**
 * Migration to add permission and quota fields to users table.
 *
 * This migration adds trust levels, resource quotas, and usage tracking fields
 * to the users collection, enabling comprehensive permission management.
 *
 * @module
 */
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { TRUST_LEVELS, DEFAULT_QUOTAS } from "@/lib/constants/permission-constants";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Add new columns to users table
  await db.execute(sql`
    ALTER TABLE "payload"."users"
    ADD COLUMN IF NOT EXISTS "trust_level" INTEGER DEFAULT ${TRUST_LEVELS.REGULAR},
    ADD COLUMN IF NOT EXISTS "quotas_max_active_schedules" INTEGER DEFAULT 5,
    ADD COLUMN IF NOT EXISTS "quotas_max_url_fetches_per_day" INTEGER DEFAULT 20,
    ADD COLUMN IF NOT EXISTS "quotas_max_file_uploads_per_day" INTEGER DEFAULT 10,
    ADD COLUMN IF NOT EXISTS "quotas_max_events_per_import" INTEGER DEFAULT 10000,
    ADD COLUMN IF NOT EXISTS "quotas_max_total_events" INTEGER DEFAULT 50000,
    ADD COLUMN IF NOT EXISTS "quotas_max_import_jobs_per_day" INTEGER DEFAULT 20,
    ADD COLUMN IF NOT EXISTS "quotas_max_file_size_mb" INTEGER DEFAULT 50,
    ADD COLUMN IF NOT EXISTS "usage_current_active_schedules" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "usage_url_fetches_today" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "usage_file_uploads_today" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "usage_import_jobs_today" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "usage_total_events_created" INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "usage_last_reset_date" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "custom_quotas" JSONB
  `);

  // Create indexes for commonly queried fields
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "users_trust_level_idx" ON "payload"."users" ("trust_level");
    CREATE INDEX IF NOT EXISTS "users_usage_last_reset_idx" ON "payload"."users" ("usage_last_reset_date");
  `);

  // Update existing users with default values based on their role
  await db.execute(sql`
    UPDATE "payload"."users"
    SET 
      "trust_level" = CASE 
        WHEN "role" = 'admin' THEN ${TRUST_LEVELS.UNLIMITED}
        WHEN "role" = 'editor' THEN ${TRUST_LEVELS.TRUSTED}
        ELSE ${TRUST_LEVELS.REGULAR}
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
      "quotas_max_file_size_mb" = CASE 
        WHEN "role" = 'admin' THEN 1000
        WHEN "role" = 'editor' THEN 100
        ELSE 50
      END
    WHERE "trust_level" IS NULL
  `);

  // Count existing active schedules for each user
  await db.execute(sql`
    UPDATE "payload"."users" u
    SET "usage_current_active_schedules" = (
      SELECT COUNT(*)
      FROM "payload"."scheduled_imports" si
      WHERE si."created_by_id" = u."id" AND si."enabled" = true
    )
  `);

  // Count total events created by each user (if there's a created_by field on events)
  // This assumes events have a created_by relationship - adjust if needed
  try {
    await db.execute(sql`
      UPDATE "payload"."users" u
      SET "usage_total_events_created" = (
        SELECT COUNT(*)
        FROM "payload"."events" e
        WHERE e."created_by_id" = u."id"
      )
    `);
  } catch (error) {
    // Events might not have created_by field, that's okay
    console.log("Could not update total events count - events may not have created_by field");
  }

  console.log("✅ User permission and quota fields added successfully");
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Drop indexes
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload"."users_trust_level_idx";
    DROP INDEX IF EXISTS "payload"."users_usage_last_reset_idx";
  `);

  // Remove columns
  await db.execute(sql`
    ALTER TABLE "payload"."users"
    DROP COLUMN IF EXISTS "trust_level",
    DROP COLUMN IF EXISTS "quotas_max_active_schedules",
    DROP COLUMN IF EXISTS "quotas_max_url_fetches_per_day",
    DROP COLUMN IF EXISTS "quotas_max_file_uploads_per_day",
    DROP COLUMN IF EXISTS "quotas_max_events_per_import",
    DROP COLUMN IF EXISTS "quotas_max_total_events",
    DROP COLUMN IF EXISTS "quotas_max_import_jobs_per_day",
    DROP COLUMN IF EXISTS "quotas_max_file_size_mb",
    DROP COLUMN IF EXISTS "usage_current_active_schedules",
    DROP COLUMN IF EXISTS "usage_url_fetches_today",
    DROP COLUMN IF EXISTS "usage_file_uploads_today",
    DROP COLUMN IF EXISTS "usage_import_jobs_today",
    DROP COLUMN IF EXISTS "usage_total_events_created",
    DROP COLUMN IF EXISTS "usage_last_reset_date",
    DROP COLUMN IF EXISTS "custom_quotas"
  `);

  console.log("✅ User permission and quota fields removed successfully");
}