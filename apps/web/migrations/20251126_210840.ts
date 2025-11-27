import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_enable_event_creation" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_enable_dataset_creation" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_enable_import_creation" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_enable_scheduled_job_execution" boolean DEFAULT true;
  ALTER TABLE "payload"."settings" ADD COLUMN "feature_flags_enable_url_fetch_caching" boolean DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_enable_event_creation";
  ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_enable_dataset_creation";
  ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_enable_import_creation";
  ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_enable_scheduled_job_execution";
  ALTER TABLE "payload"."settings" DROP COLUMN "feature_flags_enable_url_fetch_caching";`)
}
