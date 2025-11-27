import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" ADD COLUMN "event_stats_event_count" numeric DEFAULT 0;
  ALTER TABLE "payload"."datasets" ADD COLUMN "event_stats_last_event_updated_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_event_stats_event_count" numeric DEFAULT 0;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_event_stats_last_event_updated_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."dataset_schemas" ADD COLUMN "event_count_at_creation" numeric;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD COLUMN "version_event_count_at_creation" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" DROP COLUMN "event_stats_event_count";
  ALTER TABLE "payload"."datasets" DROP COLUMN "event_stats_last_event_updated_at";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_event_stats_event_count";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_event_stats_last_event_updated_at";
  ALTER TABLE "payload"."dataset_schemas" DROP COLUMN "event_count_at_creation";
  ALTER TABLE "payload"."_dataset_schemas_v" DROP COLUMN "version_event_count_at_creation";`)
}
