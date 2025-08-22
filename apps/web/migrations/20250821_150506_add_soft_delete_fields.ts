import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  DROP INDEX "payload"."import_jobs_schema_validation_schema_validation_approved_by_idx";
  DROP INDEX "payload"."_import_jobs_v_version_schema_validation_version_schema_validation_approved_by_idx";
  DROP INDEX "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets_dataset_idx";
  DROP INDEX "payload"."_media_v_version_sizes_thumbnail_version_sizes_thumbnail_filename_idx";
  DROP INDEX "payload"."_media_v_version_sizes_tablet_version_sizes_tablet_filename_idx";
  ALTER TABLE "payload"."catalogs" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_catalogs_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."datasets" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."dataset_schemas" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."import_files" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_import_files_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."import_jobs" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_import_jobs_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."scheduled_imports" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_scheduled_imports_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."events" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_events_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."users" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_users_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."media" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_media_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."location_cache" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_location_cache_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."geocoding_providers" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."pages" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."_pages_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload"."payload_jobs" ADD COLUMN "meta" jsonb;
  CREATE INDEX "catalogs_deleted_at_idx" ON "payload"."catalogs" USING btree ("deleted_at");
  CREATE INDEX "_catalogs_v_version_version_deleted_at_idx" ON "payload"."_catalogs_v" USING btree ("version_deleted_at");
  CREATE INDEX "datasets_deleted_at_idx" ON "payload"."datasets" USING btree ("deleted_at");
  CREATE INDEX "_datasets_v_version_version_deleted_at_idx" ON "payload"."_datasets_v" USING btree ("version_deleted_at");
  CREATE INDEX "dataset_schemas_deleted_at_idx" ON "payload"."dataset_schemas" USING btree ("deleted_at");
  CREATE INDEX "_dataset_schemas_v_version_version_deleted_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_deleted_at");
  CREATE INDEX "import_files_deleted_at_idx" ON "payload"."import_files" USING btree ("deleted_at");
  CREATE INDEX "_import_files_v_version_version_deleted_at_idx" ON "payload"."_import_files_v" USING btree ("version_deleted_at");
  CREATE INDEX "import_jobs_schema_validation_schema_validation_approved_idx" ON "payload"."import_jobs" USING btree ("schema_validation_approved_by_id");
  CREATE INDEX "import_jobs_deleted_at_idx" ON "payload"."import_jobs" USING btree ("deleted_at");
  CREATE INDEX "_import_jobs_v_version_schema_validation_version_schema__idx" ON "payload"."_import_jobs_v" USING btree ("version_schema_validation_approved_by_id");
  CREATE INDEX "_import_jobs_v_version_version_deleted_at_idx" ON "payload"."_import_jobs_v" USING btree ("version_deleted_at");
  CREATE INDEX "scheduled_imports_deleted_at_idx" ON "payload"."scheduled_imports" USING btree ("deleted_at");
  CREATE INDEX "_scheduled_imports_v_version_multi_sheet_config_sheets_d_idx" ON "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" USING btree ("dataset_id");
  CREATE INDEX "_scheduled_imports_v_version_version_deleted_at_idx" ON "payload"."_scheduled_imports_v" USING btree ("version_deleted_at");
  CREATE INDEX "events_deleted_at_idx" ON "payload"."events" USING btree ("deleted_at");
  CREATE INDEX "_events_v_version_version_deleted_at_idx" ON "payload"."_events_v" USING btree ("version_deleted_at");
  CREATE INDEX "users_deleted_at_idx" ON "payload"."users" USING btree ("deleted_at");
  CREATE INDEX "_users_v_version_version_deleted_at_idx" ON "payload"."_users_v" USING btree ("version_deleted_at");
  CREATE INDEX "media_deleted_at_idx" ON "payload"."media" USING btree ("deleted_at");
  CREATE INDEX "_media_v_version_version_deleted_at_idx" ON "payload"."_media_v" USING btree ("version_deleted_at");
  CREATE INDEX "_media_v_version_sizes_thumbnail_version_sizes_thumbnail_idx" ON "payload"."_media_v" USING btree ("version_sizes_thumbnail_filename");
  CREATE INDEX "_media_v_version_sizes_tablet_version_sizes_tablet_filen_idx" ON "payload"."_media_v" USING btree ("version_sizes_tablet_filename");
  CREATE INDEX "location_cache_deleted_at_idx" ON "payload"."location_cache" USING btree ("deleted_at");
  CREATE INDEX "_location_cache_v_version_version_deleted_at_idx" ON "payload"."_location_cache_v" USING btree ("version_deleted_at");
  CREATE INDEX "geocoding_providers_deleted_at_idx" ON "payload"."geocoding_providers" USING btree ("deleted_at");
  CREATE INDEX "_geocoding_providers_v_version_version_deleted_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("version_deleted_at");
  CREATE INDEX "pages_deleted_at_idx" ON "payload"."pages" USING btree ("deleted_at");
  CREATE INDEX "_pages_v_version_version_deleted_at_idx" ON "payload"."_pages_v" USING btree ("version_deleted_at");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."payload_jobs_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."payload_jobs_stats" CASCADE;
  DROP INDEX "payload"."catalogs_deleted_at_idx";
  DROP INDEX "payload"."_catalogs_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."datasets_deleted_at_idx";
  DROP INDEX "payload"."_datasets_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."dataset_schemas_deleted_at_idx";
  DROP INDEX "payload"."_dataset_schemas_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."import_files_deleted_at_idx";
  DROP INDEX "payload"."_import_files_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."import_jobs_schema_validation_schema_validation_approved_idx";
  DROP INDEX "payload"."import_jobs_deleted_at_idx";
  DROP INDEX "payload"."_import_jobs_v_version_schema_validation_version_schema__idx";
  DROP INDEX "payload"."_import_jobs_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."scheduled_imports_deleted_at_idx";
  DROP INDEX "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets_d_idx";
  DROP INDEX "payload"."_scheduled_imports_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."events_deleted_at_idx";
  DROP INDEX "payload"."_events_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."users_deleted_at_idx";
  DROP INDEX "payload"."_users_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."media_deleted_at_idx";
  DROP INDEX "payload"."_media_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."_media_v_version_sizes_thumbnail_version_sizes_thumbnail_idx";
  DROP INDEX "payload"."_media_v_version_sizes_tablet_version_sizes_tablet_filen_idx";
  DROP INDEX "payload"."location_cache_deleted_at_idx";
  DROP INDEX "payload"."_location_cache_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."geocoding_providers_deleted_at_idx";
  DROP INDEX "payload"."_geocoding_providers_v_version_version_deleted_at_idx";
  DROP INDEX "payload"."pages_deleted_at_idx";
  DROP INDEX "payload"."_pages_v_version_version_deleted_at_idx";
  CREATE INDEX "import_jobs_schema_validation_schema_validation_approved_by_idx" ON "payload"."import_jobs" USING btree ("schema_validation_approved_by_id");
  CREATE INDEX "_import_jobs_v_version_schema_validation_version_schema_validation_approved_by_idx" ON "payload"."_import_jobs_v" USING btree ("version_schema_validation_approved_by_id");
  CREATE INDEX "_scheduled_imports_v_version_multi_sheet_config_sheets_dataset_idx" ON "payload"."_scheduled_imports_v_version_multi_sheet_config_sheets" USING btree ("dataset_id");
  CREATE INDEX "_media_v_version_sizes_thumbnail_version_sizes_thumbnail_filename_idx" ON "payload"."_media_v" USING btree ("version_sizes_thumbnail_filename");
  CREATE INDEX "_media_v_version_sizes_tablet_version_sizes_tablet_filename_idx" ON "payload"."_media_v" USING btree ("version_sizes_tablet_filename");
  ALTER TABLE "payload"."catalogs" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_catalogs_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."datasets" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."dataset_schemas" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_dataset_schemas_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."import_files" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_import_files_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."import_jobs" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_import_jobs_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."scheduled_imports" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_scheduled_imports_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."events" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_events_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."users" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_users_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."media" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_media_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."location_cache" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_location_cache_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."geocoding_providers" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_geocoding_providers_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."pages" DROP COLUMN "deleted_at";
  ALTER TABLE "payload"."_pages_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "payload"."payload_jobs" DROP COLUMN "meta";`);
}
