import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_end_timestamp_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_end_timestamp_path" varchar;
  ALTER TABLE "payload"."dataset_schemas" ADD COLUMN "field_mappings_end_timestamp_path" varchar;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD COLUMN "version_field_mappings_end_timestamp_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_end_timestamp_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_end_timestamp_path" varchar;
  ALTER TABLE "payload"."events" ADD COLUMN "event_end_timestamp" timestamp(3) with time zone;
  ALTER TABLE "payload"."_events_v" ADD COLUMN "version_event_end_timestamp" timestamp(3) with time zone;
  CREATE INDEX "eventEndTimestamp_idx" ON "payload"."events" USING btree ("event_end_timestamp");
  CREATE INDEX "version_eventEndTimestamp_idx" ON "payload"."_events_v" USING btree ("version_event_end_timestamp");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."eventEndTimestamp_idx";
  DROP INDEX "payload"."version_eventEndTimestamp_idx";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_end_timestamp_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_end_timestamp_path";
  ALTER TABLE "payload"."dataset_schemas" DROP COLUMN "field_mappings_end_timestamp_path";
  ALTER TABLE "payload"."_dataset_schemas_v" DROP COLUMN "version_field_mappings_end_timestamp_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_end_timestamp_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_end_timestamp_path";
  ALTER TABLE "payload"."events" DROP COLUMN "event_end_timestamp";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "version_event_end_timestamp";`)
}
