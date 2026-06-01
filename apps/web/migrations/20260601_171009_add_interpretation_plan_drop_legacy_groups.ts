import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."datasets_ingest_transforms" CASCADE;
  DROP TABLE "payload"."_datasets_v_version_ingest_transforms" CASCADE;
  ALTER TABLE "payload"."datasets" ADD COLUMN "interpretation_plan" jsonb;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_interpretation_plan" jsonb;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "interpretation_plan" jsonb;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_interpretation_plan" jsonb;
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_title_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_description_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_location_name_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_timestamp_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_end_timestamp_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_timestamp_order";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_end_timestamp_order";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_latitude_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_longitude_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_coordinate_path";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_coordinate_format";
  ALTER TABLE "payload"."datasets" DROP COLUMN "field_mapping_overrides_location_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_title_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_description_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_location_name_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_timestamp_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_end_timestamp_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_timestamp_order";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_end_timestamp_order";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_latitude_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_longitude_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_coordinate_path";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_coordinate_format";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_field_mapping_overrides_location_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_title_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_description_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_location_name_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_timestamp_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_end_timestamp_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_timestamp_order";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_end_timestamp_order";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_latitude_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_longitude_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_coordinate_path";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_coordinate_format";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "detected_field_mappings_location_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_title_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_description_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_location_name_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_timestamp_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_end_timestamp_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_timestamp_order";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_end_timestamp_order";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_latitude_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_longitude_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_coordinate_path";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_coordinate_format";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_detected_field_mappings_location_path";
  DROP TYPE "payload"."enum_datasets_ingest_transforms_type";
  DROP TYPE "payload"."enum_datasets_ingest_transforms_input_format";
  DROP TYPE "payload"."enum_datasets_ingest_transforms_output_format";
  DROP TYPE "payload"."enum_datasets_ingest_transforms_operation";
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_type";
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format";
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_output_format";
  DROP TYPE "payload"."enum__datasets_v_version_ingest_transforms_operation";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_datasets_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split', 'parse-json-array', 'split-to-array', 'extract');
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_input_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY', 'YYYY/MM/DD', 'D MMMM YYYY', 'MMMM D, YYYY');
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_output_format" AS ENUM('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY');
  CREATE TYPE "payload"."enum_datasets_ingest_transforms_operation" AS ENUM('uppercase', 'lowercase', 'trim', 'replace', 'expression');
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_type" AS ENUM('rename', 'date-parse', 'string-op', 'concatenate', 'split', 'parse-json-array', 'split-to-array', 'extract');
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_input_format" AS ENUM('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY', 'YYYY/MM/DD', 'D MMMM YYYY', 'MMMM D, YYYY');
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_output_format" AS ENUM('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY');
  CREATE TYPE "payload"."enum__datasets_v_version_ingest_transforms_operation" AS ENUM('uppercase', 'lowercase', 'trim', 'replace', 'expression');
  CREATE TABLE "payload"."datasets_ingest_transforms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "payload"."enum_datasets_ingest_transforms_type" DEFAULT 'rename',
  	"from" varchar,
  	"to" varchar,
  	"input_format" "payload"."enum_datasets_ingest_transforms_input_format",
  	"output_format" "payload"."enum_datasets_ingest_transforms_output_format" DEFAULT 'YYYY-MM-DD',
  	"timezone" varchar,
  	"operation" "payload"."enum_datasets_ingest_transforms_operation",
  	"pattern" varchar,
  	"group" numeric,
  	"replacement" varchar,
  	"expression" varchar,
  	"from_fields" jsonb,
  	"separator" varchar DEFAULT ' ',
  	"delimiter" varchar DEFAULT ',',
  	"to_fields" jsonb,
  	"active" boolean DEFAULT true,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer,
  	"confidence" numeric,
  	"auto_detected" boolean DEFAULT false
  );
  
  CREATE TABLE "payload"."_datasets_v_version_ingest_transforms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"type" "payload"."enum__datasets_v_version_ingest_transforms_type" DEFAULT 'rename',
  	"from" varchar,
  	"to" varchar,
  	"input_format" "payload"."enum__datasets_v_version_ingest_transforms_input_format",
  	"output_format" "payload"."enum__datasets_v_version_ingest_transforms_output_format" DEFAULT 'YYYY-MM-DD',
  	"timezone" varchar,
  	"operation" "payload"."enum__datasets_v_version_ingest_transforms_operation",
  	"pattern" varchar,
  	"group" numeric,
  	"replacement" varchar,
  	"expression" varchar,
  	"from_fields" jsonb,
  	"separator" varchar DEFAULT ' ',
  	"delimiter" varchar DEFAULT ',',
  	"to_fields" jsonb,
  	"active" boolean DEFAULT true,
  	"added_at" timestamp(3) with time zone,
  	"added_by_id" integer,
  	"confidence" numeric,
  	"auto_detected" boolean DEFAULT false
  );
  
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_title_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_description_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_location_name_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_timestamp_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_end_timestamp_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_timestamp_order" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_end_timestamp_order" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_latitude_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_longitude_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_coordinate_path" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_coordinate_format" varchar;
  ALTER TABLE "payload"."datasets" ADD COLUMN "field_mapping_overrides_location_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_title_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_description_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_location_name_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_timestamp_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_end_timestamp_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_timestamp_order" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_end_timestamp_order" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_latitude_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_longitude_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_coordinate_path" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_coordinate_format" varchar;
  ALTER TABLE "payload"."_datasets_v" ADD COLUMN "version_field_mapping_overrides_location_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_title_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_description_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_location_name_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_timestamp_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_end_timestamp_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_timestamp_order" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_end_timestamp_order" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_latitude_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_longitude_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_coordinate_path" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_coordinate_format" varchar;
  ALTER TABLE "payload"."ingest_jobs" ADD COLUMN "detected_field_mappings_location_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_title_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_description_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_location_name_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_timestamp_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_end_timestamp_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_timestamp_order" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_end_timestamp_order" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_latitude_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_longitude_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_coordinate_path" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_coordinate_format" varchar;
  ALTER TABLE "payload"."_ingest_jobs_v" ADD COLUMN "version_detected_field_mappings_location_path" varchar;
  ALTER TABLE "payload"."datasets_ingest_transforms" ADD CONSTRAINT "datasets_ingest_transforms_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."datasets_ingest_transforms" ADD CONSTRAINT "datasets_ingest_transforms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ADD CONSTRAINT "_datasets_v_version_ingest_transforms_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_ingest_transforms" ADD CONSTRAINT "_datasets_v_version_ingest_transforms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "datasets_ingest_transforms_order_idx" ON "payload"."datasets_ingest_transforms" USING btree ("_order");
  CREATE INDEX "datasets_ingest_transforms_parent_id_idx" ON "payload"."datasets_ingest_transforms" USING btree ("_parent_id");
  CREATE INDEX "datasets_ingest_transforms_added_by_idx" ON "payload"."datasets_ingest_transforms" USING btree ("added_by_id");
  CREATE INDEX "_datasets_v_version_ingest_transforms_order_idx" ON "payload"."_datasets_v_version_ingest_transforms" USING btree ("_order");
  CREATE INDEX "_datasets_v_version_ingest_transforms_parent_id_idx" ON "payload"."_datasets_v_version_ingest_transforms" USING btree ("_parent_id");
  CREATE INDEX "_datasets_v_version_ingest_transforms_added_by_idx" ON "payload"."_datasets_v_version_ingest_transforms" USING btree ("added_by_id");
  ALTER TABLE "payload"."datasets" DROP COLUMN "interpretation_plan";
  ALTER TABLE "payload"."_datasets_v" DROP COLUMN "version_interpretation_plan";
  ALTER TABLE "payload"."ingest_jobs" DROP COLUMN "interpretation_plan";
  ALTER TABLE "payload"."_ingest_jobs_v" DROP COLUMN "version_interpretation_plan";`)
}
