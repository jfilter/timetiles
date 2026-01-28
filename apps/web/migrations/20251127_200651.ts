import type { MigrateUpArgs, MigrateDownArgs} from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_location_name_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_location_name_path" varchar;
  ALTER TABLE "payload"."dataset_schemas" ADD COLUMN "field_mappings_location_name_path" varchar;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD COLUMN "version_field_mappings_location_name_path" varchar;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "detected_field_mappings_location_name_path" varchar;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_detected_field_mappings_location_name_path" varchar;
  ALTER TABLE "payload"."events" ADD COLUMN "location_name" varchar;
  ALTER TABLE "payload"."_events_v" ADD COLUMN "version_location_name" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_location_name_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_location_name_path";
  ALTER TABLE "payload"."dataset_schemas" DROP COLUMN "field_mappings_location_name_path";
  ALTER TABLE "payload"."_dataset_schemas_v" DROP COLUMN "version_field_mappings_location_name_path";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN "detected_field_mappings_location_name_path";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_detected_field_mappings_location_name_path";
  ALTER TABLE "payload"."events" DROP COLUMN "location_name";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "version_location_name";`)
}
