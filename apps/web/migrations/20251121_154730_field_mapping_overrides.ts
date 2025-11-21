import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DEFAULT 'auto';
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DEFAULT 'auto';
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_latitude_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_longitude_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_location_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_latitude_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_longitude_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_location_path" varchar;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "detected_field_mappings_latitude_path" varchar;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "detected_field_mappings_longitude_path" varchar;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "detected_field_mappings_location_path" varchar;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_detected_field_mappings_latitude_path" varchar;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_detected_field_mappings_longitude_path" varchar;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_detected_field_mappings_location_path" varchar;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."datasets" ALTER COLUMN "id_strategy_type" SET DEFAULT 'external';
  ALTER TABLE "payload"."_datasets_v" ALTER COLUMN "version_id_strategy_type" SET DEFAULT 'external';
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_latitude_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_longitude_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_location_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_latitude_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_longitude_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_location_path";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN "detected_field_mappings_latitude_path";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN "detected_field_mappings_longitude_path";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN "detected_field_mappings_location_path";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_detected_field_mappings_latitude_path";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_detected_field_mappings_longitude_path";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_detected_field_mappings_location_path";`);
}
