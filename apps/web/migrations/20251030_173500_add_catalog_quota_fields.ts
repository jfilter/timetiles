import type { MigrateUpArgs, MigrateDownArgs} from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres'

/**
 * Migration to add catalog quota fields to users collection.
 * Adds maxCatalogsPerUser quota and currentCatalogs usage tracking.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."users" ADD COLUMN IF NOT EXISTS "quotas_max_catalogs_per_user" numeric;
  ALTER TABLE "payload"."users" ADD COLUMN IF NOT EXISTS "usage_current_catalogs" numeric;
  ALTER TABLE "payload"."_users_v" ADD COLUMN IF NOT EXISTS "version_quotas_max_catalogs_per_user" numeric;
  ALTER TABLE "payload"."_users_v" ADD COLUMN IF NOT EXISTS "version_usage_current_catalogs" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload"."users" DROP COLUMN IF EXISTS "quotas_max_catalogs_per_user";
  ALTER TABLE "payload"."users" DROP COLUMN IF EXISTS "usage_current_catalogs";
  ALTER TABLE "payload"."_users_v" DROP COLUMN IF EXISTS "version_quotas_max_catalogs_per_user";
  ALTER TABLE "payload"."_users_v" DROP COLUMN IF EXISTS "version_usage_current_catalogs";`)
}
