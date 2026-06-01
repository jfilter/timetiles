import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_coordinate_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_coordinate_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_coordinate_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_coordinate_format" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_coordinate_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_coordinate_format" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_coordinate_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_coordinate_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_coordinate_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_coordinate_format";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_coordinate_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_coordinate_format";`)
}
