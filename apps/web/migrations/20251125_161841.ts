import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" DROP COLUMN "usage_current_active_schedules";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_url_fetches_today";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_file_uploads_today";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_import_jobs_today";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_total_events_created";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_current_catalogs";
  ALTER TABLE "payload"."users" DROP COLUMN "usage_last_reset_date";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."users" ADD COLUMN "usage_current_active_schedules" numeric;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_url_fetches_today" numeric;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_file_uploads_today" numeric;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_import_jobs_today" numeric;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_total_events_created" numeric;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_current_catalogs" numeric;
  ALTER TABLE "payload"."users" ADD COLUMN "usage_last_reset_date" timestamp(3) with time zone;`)
}
