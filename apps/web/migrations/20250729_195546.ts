import { sql } from "@payloadcms/db-postgres";
import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_catalogs_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__catalogs_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_transforms_from_type" AS ENUM('string', 'number', 'boolean', 'null', 'array', 'object');
  CREATE TYPE "payload"."enum_transforms_to_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object');
  CREATE TYPE "payload"."strategy" AS ENUM('parse', 'cast', 'custom', 'reject');
  CREATE TYPE "payload"."enum_datasets_id_strategy_type" AS ENUM('external', 'computed', 'auto', 'hybrid');
  CREATE TYPE "payload"."enum_datasets_id_strategy_duplicate_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum_datasets_schema_config_enum_mode" AS ENUM('count', 'percentage');
  CREATE TYPE "payload"."enum_datasets_deduplication_config_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum_datasets_enum_detection_mode" AS ENUM('count', 'percentage', 'disabled');
  CREATE TYPE "payload"."enum_datasets_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__transforms_v_from_type" AS ENUM('string', 'number', 'boolean', 'null', 'array', 'object');
  CREATE TYPE "payload"."enum__transforms_v_to_type" AS ENUM('string', 'number', 'boolean', 'date', 'array', 'object');
  CREATE TYPE "payload"."enum__datasets_v_version_id_strategy_type" AS ENUM('external', 'computed', 'auto', 'hybrid');
  CREATE TYPE "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum__datasets_v_version_schema_config_enum_mode" AS ENUM('count', 'percentage');
  CREATE TYPE "payload"."enum__datasets_v_version_deduplication_config_strategy" AS ENUM('skip', 'update', 'version');
  CREATE TYPE "payload"."enum__datasets_v_version_enum_detection_mode" AS ENUM('count', 'percentage', 'disabled');
  CREATE TYPE "payload"."enum__datasets_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_dataset_schemas_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__dataset_schemas_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_import_files_status" AS ENUM('pending', 'parsing', 'processing', 'completed', 'failed');
  CREATE TYPE "payload"."enum__import_files_v_version_status" AS ENUM('pending', 'parsing', 'processing', 'completed', 'failed');
  CREATE TYPE "payload"."enum_import_jobs_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events', 'completed', 'failed');
  CREATE TYPE "payload"."enum_import_jobs_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events');
  CREATE TYPE "payload"."enum__import_jobs_v_version_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events', 'completed', 'failed');
  CREATE TYPE "payload"."enum__import_jobs_v_version_last_successful_stage" AS ENUM('analyze-duplicates', 'detect-schema', 'validate-schema', 'await-approval', 'geocode-batch', 'create-events');
  CREATE TYPE "payload"."enum_events_coordinate_source_type" AS ENUM('import', 'geocoded', 'manual', 'none');
  CREATE TYPE "payload"."enum_events_coordinate_source_validation_status" AS ENUM('valid', 'out_of_range', 'suspicious_zero', 'swapped', 'invalid');
  CREATE TYPE "payload"."enum_events_geocoding_info_geocoding_status" AS ENUM('pending', 'success', 'failed');
  CREATE TYPE "payload"."enum_events_geocoding_info_provider" AS ENUM('google', 'nominatim', 'manual');
  CREATE TYPE "payload"."enum_events_validation_status" AS ENUM('pending', 'valid', 'invalid', 'transformed');
  CREATE TYPE "payload"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__events_v_version_coordinate_source_type" AS ENUM('import', 'geocoded', 'manual', 'none');
  CREATE TYPE "payload"."enum__events_v_version_coordinate_source_validation_status" AS ENUM('valid', 'out_of_range', 'suspicious_zero', 'swapped', 'invalid');
  CREATE TYPE "payload"."enum__events_v_version_geocoding_info_geocoding_status" AS ENUM('pending', 'success', 'failed');
  CREATE TYPE "payload"."enum__events_v_version_geocoding_info_provider" AS ENUM('google', 'nominatim', 'manual');
  CREATE TYPE "payload"."enum__events_v_version_validation_status" AS ENUM('pending', 'valid', 'invalid', 'transformed');
  CREATE TYPE "payload"."enum__events_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_users_role" AS ENUM('user', 'admin', 'editor');
  CREATE TYPE "payload"."enum_users_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__users_v_version_role" AS ENUM('user', 'admin', 'editor');
  CREATE TYPE "payload"."enum__users_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_media_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__media_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_location_cache_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__location_cache_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_geocoding_providers_tags" AS ENUM('production', 'development', 'testing', 'backup', 'primary', 'secondary', 'region-us', 'region-eu', 'region-asia', 'region-global', 'high-volume', 'low-volume', 'free-tier', 'paid-tier');
  CREATE TYPE "payload"."enum_geocoding_providers_type" AS ENUM('google', 'nominatim', 'opencage');
  CREATE TYPE "payload"."enum_geocoding_providers_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__geocoding_providers_v_version_tags" AS ENUM('production', 'development', 'testing', 'backup', 'primary', 'secondary', 'region-us', 'region-eu', 'region-asia', 'region-global', 'high-volume', 'low-volume', 'free-tier', 'paid-tier');
  CREATE TYPE "payload"."enum__geocoding_providers_v_version_type" AS ENUM('google', 'nominatim', 'opencage');
  CREATE TYPE "payload"."enum__geocoding_providers_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'geocode-batch', 'create-events', 'cleanup-approval-locks');
  CREATE TYPE "payload"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "payload"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dataset-detection', 'detect-schema', 'analyze-duplicates', 'validate-schema', 'geocode-batch', 'create-events', 'cleanup-approval-locks');
  CREATE TYPE "payload"."enum_main_menu_status" AS ENUM('draft', 'published');
  CREATE TYPE "payload"."enum__main_menu_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "payload"."catalogs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" jsonb,
  	"slug" varchar,
  	"is_public" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_catalogs_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_catalogs_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_description" jsonb,
  	"version_slug" varchar,
  	"version_is_public" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__catalogs_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."datasets_id_strategy_computed_id_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field_path" varchar
  );

  CREATE TABLE "payload"."transforms" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"from_type" "payload"."enum_transforms_from_type",
  	"to_type" "payload"."enum_transforms_to_type",
  	"transform_strategy" "payload"."strategy" DEFAULT 'parse',
  	"custom_transform" varchar,
  	"enabled" boolean DEFAULT true
  );

  CREATE TABLE "payload"."datasets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"description" jsonb,
  	"slug" varchar,
  	"catalog_id" integer,
  	"language" varchar,
  	"is_public" boolean DEFAULT false,
  	"metadata" jsonb,
  	"id_strategy_type" "payload"."enum_datasets_id_strategy_type" DEFAULT 'external',
  	"id_strategy_external_id_path" varchar,
  	"id_strategy_duplicate_strategy" "payload"."enum_datasets_id_strategy_duplicate_strategy" DEFAULT 'skip',
  	"schema_config_enabled" boolean DEFAULT false,
  	"schema_config_locked" boolean DEFAULT false,
  	"schema_config_auto_grow" boolean DEFAULT true,
  	"schema_config_auto_approve_non_breaking" boolean DEFAULT false,
  	"schema_config_strict_validation" boolean DEFAULT false,
  	"schema_config_allow_transformations" boolean DEFAULT true,
  	"schema_config_max_schema_depth" numeric DEFAULT 3,
  	"schema_config_enum_threshold" numeric DEFAULT 50,
  	"schema_config_enum_mode" "payload"."enum_datasets_schema_config_enum_mode" DEFAULT 'count',
  	"deduplication_config_enabled" boolean DEFAULT true,
  	"deduplication_config_strategy" "payload"."enum_datasets_deduplication_config_strategy" DEFAULT 'skip',
  	"field_metadata" jsonb,
  	"enum_detection_mode" "payload"."enum_datasets_enum_detection_mode" DEFAULT 'count',
  	"enum_detection_threshold" numeric DEFAULT 50,
  	"geo_field_detection_auto_detect" boolean DEFAULT true,
  	"geo_field_detection_latitude_path" varchar,
  	"geo_field_detection_longitude_path" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_datasets_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_transforms_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"field_path" varchar,
  	"from_type" "payload"."enum__transforms_v_from_type",
  	"to_type" "payload"."enum__transforms_v_to_type",
  	"transform_strategy" "payload"."strategy" DEFAULT 'parse',
  	"custom_transform" varchar,
  	"enabled" boolean DEFAULT true,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_datasets_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_description" jsonb,
  	"version_slug" varchar,
  	"version_catalog_id" integer,
  	"version_language" varchar,
  	"version_is_public" boolean DEFAULT false,
  	"version_metadata" jsonb,
  	"version_id_strategy_type" "payload"."enum__datasets_v_version_id_strategy_type" DEFAULT 'external',
  	"version_id_strategy_external_id_path" varchar,
  	"version_id_strategy_duplicate_strategy" "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy" DEFAULT 'skip',
  	"version_schema_config_enabled" boolean DEFAULT false,
  	"version_schema_config_locked" boolean DEFAULT false,
  	"version_schema_config_auto_grow" boolean DEFAULT true,
  	"version_schema_config_auto_approve_non_breaking" boolean DEFAULT false,
  	"version_schema_config_strict_validation" boolean DEFAULT false,
  	"version_schema_config_allow_transformations" boolean DEFAULT true,
  	"version_schema_config_max_schema_depth" numeric DEFAULT 3,
  	"version_schema_config_enum_threshold" numeric DEFAULT 50,
  	"version_schema_config_enum_mode" "payload"."enum__datasets_v_version_schema_config_enum_mode" DEFAULT 'count',
  	"version_deduplication_config_enabled" boolean DEFAULT true,
  	"version_deduplication_config_strategy" "payload"."enum__datasets_v_version_deduplication_config_strategy" DEFAULT 'skip',
  	"version_field_metadata" jsonb,
  	"version_enum_detection_mode" "payload"."enum__datasets_v_version_enum_detection_mode" DEFAULT 'count',
  	"version_enum_detection_threshold" numeric DEFAULT 50,
  	"version_geo_field_detection_auto_detect" boolean DEFAULT true,
  	"version_geo_field_detection_latitude_path" varchar,
  	"version_geo_field_detection_longitude_path" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__datasets_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."dataset_schemas_schema_summary_new_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );

  CREATE TABLE "payload"."dataset_schemas_schema_summary_removed_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar
  );

  CREATE TABLE "payload"."dataset_schemas_schema_summary_type_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"old_type" varchar,
  	"new_type" varchar
  );

  CREATE TABLE "payload"."dataset_schemas_schema_summary_enum_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"added_values" jsonb,
  	"removed_values" jsonb
  );

  CREATE TABLE "payload"."dataset_schemas_import_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"import_id" integer,
  	"record_count" numeric,
  	"batch_count" numeric
  );

  CREATE TABLE "payload"."dataset_schemas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dataset_id" integer,
  	"version_number" numeric,
  	"display_name" varchar,
  	"schema" jsonb,
  	"field_metadata" jsonb,
  	"schema_summary_total_fields" numeric,
  	"approval_required" boolean,
  	"approved_by_id" integer,
  	"approval_notes" varchar,
  	"auto_approved" boolean,
  	"conflicts" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_dataset_schemas_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_dataset_schemas_v_version_schema_summary_new_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_dataset_schemas_v_version_schema_summary_type_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"old_type" varchar,
  	"new_type" varchar,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"path" varchar,
  	"added_values" jsonb,
  	"removed_values" jsonb,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_dataset_schemas_v_version_import_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"import_id" integer,
  	"record_count" numeric,
  	"batch_count" numeric,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_dataset_schemas_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_dataset_id" integer,
  	"version_version_number" numeric,
  	"version_display_name" varchar,
  	"version_schema" jsonb,
  	"version_field_metadata" jsonb,
  	"version_schema_summary_total_fields" numeric,
  	"version_approval_required" boolean,
  	"version_approved_by_id" integer,
  	"version_approval_notes" varchar,
  	"version_auto_approved" boolean,
  	"version_conflicts" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__dataset_schemas_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."import_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"file_name" varchar NOT NULL,
  	"original_name" varchar,
  	"catalog_id" integer,
  	"file_size" numeric,
  	"user_id" integer,
  	"session_id" varchar,
  	"status" "payload"."enum_import_files_status" DEFAULT 'pending',
  	"datasets_count" numeric DEFAULT 0,
  	"datasets_processed" numeric DEFAULT 0,
  	"sheet_metadata" jsonb,
  	"job_id" varchar,
  	"imported_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"error_log" varchar,
  	"rate_limit_info" jsonb,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );

  CREATE TABLE "payload"."import_files_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"datasets_id" integer
  );

  CREATE TABLE "payload"."_import_files_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_file_name" varchar NOT NULL,
  	"version_original_name" varchar,
  	"version_catalog_id" integer,
  	"version_file_size" numeric,
  	"version_user_id" integer,
  	"version_session_id" varchar,
  	"version_status" "payload"."enum__import_files_v_version_status" DEFAULT 'pending',
  	"version_datasets_count" numeric DEFAULT 0,
  	"version_datasets_processed" numeric DEFAULT 0,
  	"version_sheet_metadata" jsonb,
  	"version_job_id" varchar,
  	"version_imported_at" timestamp(3) with time zone,
  	"version_completed_at" timestamp(3) with time zone,
  	"version_error_log" varchar,
  	"version_rate_limit_info" jsonb,
  	"version_metadata" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_url" varchar,
  	"version_thumbnail_u_r_l" varchar,
  	"version_filename" varchar,
  	"version_mime_type" varchar,
  	"version_filesize" numeric,
  	"version_width" numeric,
  	"version_height" numeric,
  	"version_focal_x" numeric,
  	"version_focal_y" numeric,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."_import_files_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"datasets_id" integer
  );

  CREATE TABLE "payload"."import_jobs_errors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"row" numeric,
  	"error" varchar
  );

  CREATE TABLE "payload"."import_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"import_file_id" integer NOT NULL,
  	"dataset_id" integer NOT NULL,
  	"sheet_index" numeric,
  	"stage" "payload"."enum_import_jobs_stage" DEFAULT 'analyze-duplicates' NOT NULL,
  	"progress_current" numeric DEFAULT 0,
  	"progress_total" numeric,
  	"progress_batch_number" numeric DEFAULT 0,
  	"schema" jsonb,
  	"schema_builder_state" jsonb,
  	"schema_validation_is_compatible" boolean,
  	"schema_validation_breaking_changes" jsonb,
  	"schema_validation_new_fields" jsonb,
  	"schema_validation_requires_approval" boolean,
  	"schema_validation_approval_reason" varchar,
  	"schema_validation_approved" boolean,
  	"schema_validation_approved_by_id" integer,
  	"schema_validation_approved_at" timestamp(3) with time zone,
  	"dataset_schema_version_id" integer,
  	"duplicates_strategy" varchar,
  	"duplicates_internal" jsonb,
  	"duplicates_external" jsonb,
  	"duplicates_summary_total_rows" numeric,
  	"duplicates_summary_unique_rows" numeric,
  	"duplicates_summary_internal_duplicates" numeric,
  	"duplicates_summary_external_duplicates" numeric,
  	"geocoding_candidates" jsonb,
  	"geocoding_results" jsonb,
  	"geocoding_progress_current" numeric DEFAULT 0,
  	"geocoding_progress_total" numeric,
  	"results" jsonb,
  	"error_log" jsonb,
  	"retry_attempts" numeric DEFAULT 0,
  	"last_retry_at" timestamp(3) with time zone,
  	"next_retry_at" timestamp(3) with time zone,
  	"last_successful_stage" "payload"."enum_import_jobs_last_successful_stage",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."_import_jobs_v_version_errors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"row" numeric,
  	"error" varchar,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_import_jobs_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_import_file_id" integer NOT NULL,
  	"version_dataset_id" integer NOT NULL,
  	"version_sheet_index" numeric,
  	"version_stage" "payload"."enum__import_jobs_v_version_stage" DEFAULT 'analyze-duplicates' NOT NULL,
  	"version_progress_current" numeric DEFAULT 0,
  	"version_progress_total" numeric,
  	"version_progress_batch_number" numeric DEFAULT 0,
  	"version_schema" jsonb,
  	"version_schema_builder_state" jsonb,
  	"version_schema_validation_is_compatible" boolean,
  	"version_schema_validation_breaking_changes" jsonb,
  	"version_schema_validation_new_fields" jsonb,
  	"version_schema_validation_requires_approval" boolean,
  	"version_schema_validation_approval_reason" varchar,
  	"version_schema_validation_approved" boolean,
  	"version_schema_validation_approved_by_id" integer,
  	"version_schema_validation_approved_at" timestamp(3) with time zone,
  	"version_dataset_schema_version_id" integer,
  	"version_duplicates_strategy" varchar,
  	"version_duplicates_internal" jsonb,
  	"version_duplicates_external" jsonb,
  	"version_duplicates_summary_total_rows" numeric,
  	"version_duplicates_summary_unique_rows" numeric,
  	"version_duplicates_summary_internal_duplicates" numeric,
  	"version_duplicates_summary_external_duplicates" numeric,
  	"version_geocoding_candidates" jsonb,
  	"version_geocoding_results" jsonb,
  	"version_geocoding_progress_current" numeric DEFAULT 0,
  	"version_geocoding_progress_total" numeric,
  	"version_results" jsonb,
  	"version_error_log" jsonb,
  	"version_retry_attempts" numeric DEFAULT 0,
  	"version_last_retry_at" timestamp(3) with time zone,
  	"version_next_retry_at" timestamp(3) with time zone,
  	"version_last_successful_stage" "payload"."enum__import_jobs_v_version_last_successful_stage",
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dataset_id" integer,
  	"import_job_id" integer,
  	"data" jsonb,
  	"location_latitude" numeric,
  	"location_longitude" numeric,
  	"coordinate_source_type" "payload"."enum_events_coordinate_source_type" DEFAULT 'none',
  	"coordinate_source_import_columns_latitude_column" varchar,
  	"coordinate_source_import_columns_longitude_column" varchar,
  	"coordinate_source_import_columns_combined_column" varchar,
  	"coordinate_source_import_columns_format" varchar,
  	"coordinate_source_confidence" numeric,
  	"coordinate_source_validation_status" "payload"."enum_events_coordinate_source_validation_status",
  	"event_timestamp" timestamp(3) with time zone,
  	"validation_errors" jsonb,
  	"geocoding_info_original_address" varchar,
  	"geocoding_info_geocoding_status" "payload"."enum_events_geocoding_info_geocoding_status",
  	"geocoding_info_provider" "payload"."enum_events_geocoding_info_provider",
  	"geocoding_info_confidence" numeric,
  	"geocoding_info_normalized_address" varchar,
  	"unique_id" varchar,
  	"source_id" varchar,
  	"content_hash" varchar,
  	"import_batch" numeric,
  	"schema_version_number" numeric,
  	"validation_status" "payload"."enum_events_validation_status" DEFAULT 'pending',
  	"transformations" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_events_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_events_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_dataset_id" integer,
  	"version_import_job_id" integer,
  	"version_data" jsonb,
  	"version_location_latitude" numeric,
  	"version_location_longitude" numeric,
  	"version_coordinate_source_type" "payload"."enum__events_v_version_coordinate_source_type" DEFAULT 'none',
  	"version_coordinate_source_import_columns_latitude_column" varchar,
  	"version_coordinate_source_import_columns_longitude_column" varchar,
  	"version_coordinate_source_import_columns_combined_column" varchar,
  	"version_coordinate_source_import_columns_format" varchar,
  	"version_coordinate_source_confidence" numeric,
  	"version_coordinate_source_validation_status" "payload"."enum__events_v_version_coordinate_source_validation_status",
  	"version_event_timestamp" timestamp(3) with time zone,
  	"version_validation_errors" jsonb,
  	"version_geocoding_info_original_address" varchar,
  	"version_geocoding_info_geocoding_status" "payload"."enum__events_v_version_geocoding_info_geocoding_status",
  	"version_geocoding_info_provider" "payload"."enum__events_v_version_geocoding_info_provider",
  	"version_geocoding_info_confidence" numeric,
  	"version_geocoding_info_normalized_address" varchar,
  	"version_unique_id" varchar,
  	"version_source_id" varchar,
  	"version_content_hash" varchar,
  	"version_import_batch" numeric,
  	"version_schema_version_number" numeric,
  	"version_validation_status" "payload"."enum__events_v_version_validation_status" DEFAULT 'pending',
  	"version_transformations" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__events_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"first_name" varchar,
  	"last_name" varchar,
  	"role" "payload"."enum_users_role" DEFAULT 'user',
  	"is_active" boolean DEFAULT true,
  	"last_login_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_users_status" DEFAULT 'draft',
  	"email" varchar,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."_users_v_version_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."_users_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_first_name" varchar,
  	"version_last_name" varchar,
  	"version_role" "payload"."enum__users_v_version_role" DEFAULT 'user',
  	"version_is_active" boolean DEFAULT true,
  	"version_last_login_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__users_v_version_status" DEFAULT 'draft',
  	"version_email" varchar,
  	"version_reset_password_token" varchar,
  	"version_reset_password_expiration" timestamp(3) with time zone,
  	"version_salt" varchar,
  	"version_hash" varchar,
  	"version_login_attempts" numeric DEFAULT 0,
  	"version_lock_until" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_media_status" DEFAULT 'draft',
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_tablet_url" varchar,
  	"sizes_tablet_width" numeric,
  	"sizes_tablet_height" numeric,
  	"sizes_tablet_mime_type" varchar,
  	"sizes_tablet_filesize" numeric,
  	"sizes_tablet_filename" varchar
  );

  CREATE TABLE "payload"."_media_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_alt" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__media_v_version_status" DEFAULT 'draft',
  	"version_url" varchar,
  	"version_thumbnail_u_r_l" varchar,
  	"version_filename" varchar,
  	"version_mime_type" varchar,
  	"version_filesize" numeric,
  	"version_width" numeric,
  	"version_height" numeric,
  	"version_focal_x" numeric,
  	"version_focal_y" numeric,
  	"version_sizes_thumbnail_url" varchar,
  	"version_sizes_thumbnail_width" numeric,
  	"version_sizes_thumbnail_height" numeric,
  	"version_sizes_thumbnail_mime_type" varchar,
  	"version_sizes_thumbnail_filesize" numeric,
  	"version_sizes_thumbnail_filename" varchar,
  	"version_sizes_card_url" varchar,
  	"version_sizes_card_width" numeric,
  	"version_sizes_card_height" numeric,
  	"version_sizes_card_mime_type" varchar,
  	"version_sizes_card_filesize" numeric,
  	"version_sizes_card_filename" varchar,
  	"version_sizes_tablet_url" varchar,
  	"version_sizes_tablet_width" numeric,
  	"version_sizes_tablet_height" numeric,
  	"version_sizes_tablet_mime_type" varchar,
  	"version_sizes_tablet_filesize" numeric,
  	"version_sizes_tablet_filename" varchar,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."location_cache" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"original_address" varchar,
  	"normalized_address" varchar,
  	"latitude" numeric,
  	"longitude" numeric,
  	"provider" varchar,
  	"confidence" numeric,
  	"hit_count" numeric DEFAULT 1,
  	"last_used" timestamp(3) with time zone,
  	"components_street_number" varchar,
  	"components_street_name" varchar,
  	"components_city" varchar,
  	"components_region" varchar,
  	"components_postal_code" varchar,
  	"components_country" varchar,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_location_cache_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_location_cache_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_original_address" varchar,
  	"version_normalized_address" varchar,
  	"version_latitude" numeric,
  	"version_longitude" numeric,
  	"version_provider" varchar,
  	"version_confidence" numeric,
  	"version_hit_count" numeric DEFAULT 1,
  	"version_last_used" timestamp(3) with time zone,
  	"version_components_street_number" varchar,
  	"version_components_street_name" varchar,
  	"version_components_city" varchar,
  	"version_components_region" varchar,
  	"version_components_postal_code" varchar,
  	"version_components_country" varchar,
  	"version_metadata" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__location_cache_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."geocoding_providers_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum_geocoding_providers_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "payload"."geocoding_providers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"type" "payload"."enum_geocoding_providers_type",
  	"enabled" boolean DEFAULT true,
  	"priority" numeric DEFAULT 1,
  	"rate_limit" numeric DEFAULT 10,
  	"config_google_api_key" varchar,
  	"config_google_region" varchar,
  	"config_google_language" varchar DEFAULT 'en',
  	"config_nominatim_base_url" varchar DEFAULT 'https://nominatim.openstreetmap.org',
  	"config_nominatim_user_agent" varchar DEFAULT 'TimeTiles-App/1.0',
  	"config_nominatim_email" varchar,
  	"config_nominatim_countrycodes" varchar,
  	"config_nominatim_addressdetails" boolean DEFAULT true,
  	"config_nominatim_extratags" boolean DEFAULT false,
  	"config_opencage_api_key" varchar,
  	"config_opencage_language" varchar DEFAULT 'en',
  	"config_opencage_countrycode" varchar,
  	"config_opencage_bounds_enabled" boolean DEFAULT false,
  	"config_opencage_bounds_southwest_lat" numeric,
  	"config_opencage_bounds_southwest_lng" numeric,
  	"config_opencage_bounds_northeast_lat" numeric,
  	"config_opencage_bounds_northeast_lng" numeric,
  	"config_opencage_annotations" boolean DEFAULT true,
  	"config_opencage_abbrv" boolean DEFAULT false,
  	"statistics_total_requests" numeric DEFAULT 0,
  	"statistics_successful_requests" numeric DEFAULT 0,
  	"statistics_failed_requests" numeric DEFAULT 0,
  	"statistics_last_used" timestamp(3) with time zone,
  	"statistics_average_response_time" numeric,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_geocoding_providers_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_geocoding_providers_v_version_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "payload"."enum__geocoding_providers_v_version_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "payload"."_geocoding_providers_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_type" "payload"."enum__geocoding_providers_v_version_type",
  	"version_enabled" boolean DEFAULT true,
  	"version_priority" numeric DEFAULT 1,
  	"version_rate_limit" numeric DEFAULT 10,
  	"version_config_google_api_key" varchar,
  	"version_config_google_region" varchar,
  	"version_config_google_language" varchar DEFAULT 'en',
  	"version_config_nominatim_base_url" varchar DEFAULT 'https://nominatim.openstreetmap.org',
  	"version_config_nominatim_user_agent" varchar DEFAULT 'TimeTiles-App/1.0',
  	"version_config_nominatim_email" varchar,
  	"version_config_nominatim_countrycodes" varchar,
  	"version_config_nominatim_addressdetails" boolean DEFAULT true,
  	"version_config_nominatim_extratags" boolean DEFAULT false,
  	"version_config_opencage_api_key" varchar,
  	"version_config_opencage_language" varchar DEFAULT 'en',
  	"version_config_opencage_countrycode" varchar,
  	"version_config_opencage_bounds_enabled" boolean DEFAULT false,
  	"version_config_opencage_bounds_southwest_lat" numeric,
  	"version_config_opencage_bounds_southwest_lng" numeric,
  	"version_config_opencage_bounds_northeast_lat" numeric,
  	"version_config_opencage_bounds_northeast_lng" numeric,
  	"version_config_opencage_annotations" boolean DEFAULT true,
  	"version_config_opencage_abbrv" boolean DEFAULT false,
  	"version_statistics_total_requests" numeric DEFAULT 0,
  	"version_statistics_successful_requests" numeric DEFAULT 0,
  	"version_statistics_failed_requests" numeric DEFAULT 0,
  	"version_statistics_last_used" timestamp(3) with time zone,
  	"version_statistics_average_response_time" numeric,
  	"version_notes" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__geocoding_providers_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"content" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "payload"."enum_pages_status" DEFAULT 'draft'
  );

  CREATE TABLE "payload"."_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_content" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "payload"."enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  CREATE TABLE "payload"."payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "payload"."enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "payload"."enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );

  CREATE TABLE "payload"."payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "payload"."enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"catalogs_id" integer,
  	"datasets_id" integer,
  	"dataset_schemas_id" integer,
  	"import_files_id" integer,
  	"import_jobs_id" integer,
  	"events_id" integer,
  	"users_id" integer,
  	"media_id" integer,
  	"location_cache_id" integer,
  	"geocoding_providers_id" integer,
  	"pages_id" integer,
  	"payload_jobs_id" integer
  );

  CREATE TABLE "payload"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );

  CREATE TABLE "payload"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload"."main_menu_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar
  );

  CREATE TABLE "payload"."main_menu" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_status" "payload"."enum_main_menu_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );

  CREATE TABLE "payload"."_main_menu_v_version_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"_uuid" varchar
  );

  CREATE TABLE "payload"."_main_menu_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version__status" "payload"."enum__main_menu_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean,
  	"autosave" boolean
  );

  ALTER TABLE "payload"."_catalogs_v" ADD CONSTRAINT "_catalogs_v_parent_id_catalogs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."datasets_id_strategy_computed_id_fields" ADD CONSTRAINT "datasets_id_strategy_computed_id_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."transforms" ADD CONSTRAINT "transforms_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."datasets" ADD CONSTRAINT "datasets_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" ADD CONSTRAINT "_datasets_v_version_id_strategy_computed_id_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_transforms_v" ADD CONSTRAINT "_transforms_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_datasets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v" ADD CONSTRAINT "_datasets_v_parent_id_datasets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_datasets_v" ADD CONSTRAINT "_datasets_v_version_catalog_id_catalogs_id_fk" FOREIGN KEY ("version_catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_schema_summary_new_fields" ADD CONSTRAINT "dataset_schemas_schema_summary_new_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_schema_summary_removed_fields" ADD CONSTRAINT "dataset_schemas_schema_summary_removed_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_schema_summary_type_changes" ADD CONSTRAINT "dataset_schemas_schema_summary_type_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_schema_summary_enum_changes" ADD CONSTRAINT "dataset_schemas_schema_summary_enum_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_import_sources" ADD CONSTRAINT "dataset_schemas_import_sources_import_id_import_jobs_id_fk" FOREIGN KEY ("import_id") REFERENCES "payload"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas_import_sources" ADD CONSTRAINT "dataset_schemas_import_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas" ADD CONSTRAINT "dataset_schemas_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."dataset_schemas" ADD CONSTRAINT "dataset_schemas_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_schema_summary_new_fields" ADD CONSTRAINT "_dataset_schemas_v_version_schema_summary_new_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" ADD CONSTRAINT "_dataset_schemas_v_version_schema_summary_removed_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_schema_summary_type_changes" ADD CONSTRAINT "_dataset_schemas_v_version_schema_summary_type_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" ADD CONSTRAINT "_dataset_schemas_v_version_schema_summary_enum_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_import_sources" ADD CONSTRAINT "_dataset_schemas_v_version_import_sources_import_id_import_jobs_id_fk" FOREIGN KEY ("import_id") REFERENCES "payload"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v_version_import_sources" ADD CONSTRAINT "_dataset_schemas_v_version_import_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_dataset_schemas_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD CONSTRAINT "_dataset_schemas_v_parent_id_dataset_schemas_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD CONSTRAINT "_dataset_schemas_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_dataset_schemas_v" ADD CONSTRAINT "_dataset_schemas_v_version_approved_by_id_users_id_fk" FOREIGN KEY ("version_approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."import_files" ADD CONSTRAINT "import_files_catalog_id_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."import_files" ADD CONSTRAINT "import_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."import_files_rels" ADD CONSTRAINT "import_files_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."import_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."import_files_rels" ADD CONSTRAINT "import_files_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_import_files_v" ADD CONSTRAINT "_import_files_v_parent_id_import_files_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."import_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_files_v" ADD CONSTRAINT "_import_files_v_version_catalog_id_catalogs_id_fk" FOREIGN KEY ("version_catalog_id") REFERENCES "payload"."catalogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_files_v" ADD CONSTRAINT "_import_files_v_version_user_id_users_id_fk" FOREIGN KEY ("version_user_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_files_v_rels" ADD CONSTRAINT "_import_files_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_import_files_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_import_files_v_rels" ADD CONSTRAINT "_import_files_v_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."import_jobs_errors" ADD CONSTRAINT "import_jobs_errors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."import_jobs" ADD CONSTRAINT "import_jobs_import_file_id_import_files_id_fk" FOREIGN KEY ("import_file_id") REFERENCES "payload"."import_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."import_jobs" ADD CONSTRAINT "import_jobs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."import_jobs" ADD CONSTRAINT "import_jobs_schema_validation_approved_by_id_users_id_fk" FOREIGN KEY ("schema_validation_approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."import_jobs" ADD CONSTRAINT "import_jobs_dataset_schema_version_id_dataset_schemas_id_fk" FOREIGN KEY ("dataset_schema_version_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_jobs_v_version_errors" ADD CONSTRAINT "_import_jobs_v_version_errors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_import_jobs_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_import_jobs_v" ADD CONSTRAINT "_import_jobs_v_parent_id_import_jobs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_jobs_v" ADD CONSTRAINT "_import_jobs_v_version_import_file_id_import_files_id_fk" FOREIGN KEY ("version_import_file_id") REFERENCES "payload"."import_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_jobs_v" ADD CONSTRAINT "_import_jobs_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_jobs_v" ADD CONSTRAINT "_import_jobs_v_version_schema_validation_approved_by_id_users_id_fk" FOREIGN KEY ("version_schema_validation_approved_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_import_jobs_v" ADD CONSTRAINT "_import_jobs_v_version_dataset_schema_version_id_dataset_schemas_id_fk" FOREIGN KEY ("version_dataset_schema_version_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."events" ADD CONSTRAINT "events_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."events" ADD CONSTRAINT "events_import_job_id_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "payload"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_events_v" ADD CONSTRAINT "_events_v_parent_id_events_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_events_v" ADD CONSTRAINT "_events_v_version_dataset_id_datasets_id_fk" FOREIGN KEY ("version_dataset_id") REFERENCES "payload"."datasets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_events_v" ADD CONSTRAINT "_events_v_version_import_job_id_import_jobs_id_fk" FOREIGN KEY ("version_import_job_id") REFERENCES "payload"."import_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_users_v_version_sessions" ADD CONSTRAINT "_users_v_version_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_users_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_users_v" ADD CONSTRAINT "_users_v_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_media_v" ADD CONSTRAINT "_media_v_parent_id_media_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_location_cache_v" ADD CONSTRAINT "_location_cache_v_parent_id_location_cache_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."location_cache"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."geocoding_providers_tags" ADD CONSTRAINT "geocoding_providers_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_geocoding_providers_v_version_tags" ADD CONSTRAINT "_geocoding_providers_v_version_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."_geocoding_providers_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_geocoding_providers_v" ADD CONSTRAINT "_geocoding_providers_v_parent_id_geocoding_providers_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_catalogs_fk" FOREIGN KEY ("catalogs_id") REFERENCES "payload"."catalogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_datasets_fk" FOREIGN KEY ("datasets_id") REFERENCES "payload"."datasets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dataset_schemas_fk" FOREIGN KEY ("dataset_schemas_id") REFERENCES "payload"."dataset_schemas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_import_files_fk" FOREIGN KEY ("import_files_id") REFERENCES "payload"."import_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_import_jobs_fk" FOREIGN KEY ("import_jobs_id") REFERENCES "payload"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "payload"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "payload"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_location_cache_fk" FOREIGN KEY ("location_cache_id") REFERENCES "payload"."location_cache"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_geocoding_providers_fk" FOREIGN KEY ("geocoding_providers_id") REFERENCES "payload"."geocoding_providers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "payload"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_jobs_fk" FOREIGN KEY ("payload_jobs_id") REFERENCES "payload"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "payload"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."main_menu_nav_items" ADD CONSTRAINT "main_menu_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."main_menu"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."_main_menu_v_version_nav_items" ADD CONSTRAINT "_main_menu_v_version_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."_main_menu_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "catalogs_slug_idx" ON "payload"."catalogs" USING btree ("slug");
  CREATE INDEX "catalogs_updated_at_idx" ON "payload"."catalogs" USING btree ("updated_at");
  CREATE INDEX "catalogs_created_at_idx" ON "payload"."catalogs" USING btree ("created_at");
  CREATE INDEX "catalogs__status_idx" ON "payload"."catalogs" USING btree ("_status");
  CREATE INDEX "_catalogs_v_parent_idx" ON "payload"."_catalogs_v" USING btree ("parent_id");
  CREATE INDEX "_catalogs_v_version_version_slug_idx" ON "payload"."_catalogs_v" USING btree ("version_slug");
  CREATE INDEX "_catalogs_v_version_version_updated_at_idx" ON "payload"."_catalogs_v" USING btree ("version_updated_at");
  CREATE INDEX "_catalogs_v_version_version_created_at_idx" ON "payload"."_catalogs_v" USING btree ("version_created_at");
  CREATE INDEX "_catalogs_v_version_version__status_idx" ON "payload"."_catalogs_v" USING btree ("version__status");
  CREATE INDEX "_catalogs_v_created_at_idx" ON "payload"."_catalogs_v" USING btree ("created_at");
  CREATE INDEX "_catalogs_v_updated_at_idx" ON "payload"."_catalogs_v" USING btree ("updated_at");
  CREATE INDEX "_catalogs_v_latest_idx" ON "payload"."_catalogs_v" USING btree ("latest");
  CREATE INDEX "_catalogs_v_autosave_idx" ON "payload"."_catalogs_v" USING btree ("autosave");
  CREATE INDEX "datasets_id_strategy_computed_id_fields_order_idx" ON "payload"."datasets_id_strategy_computed_id_fields" USING btree ("_order");
  CREATE INDEX "datasets_id_strategy_computed_id_fields_parent_id_idx" ON "payload"."datasets_id_strategy_computed_id_fields" USING btree ("_parent_id");
  CREATE INDEX "transforms_order_idx" ON "payload"."transforms" USING btree ("_order");
  CREATE INDEX "transforms_parent_id_idx" ON "payload"."transforms" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "datasets_slug_idx" ON "payload"."datasets" USING btree ("slug");
  CREATE INDEX "datasets_catalog_idx" ON "payload"."datasets" USING btree ("catalog_id");
  CREATE INDEX "datasets_updated_at_idx" ON "payload"."datasets" USING btree ("updated_at");
  CREATE INDEX "datasets_created_at_idx" ON "payload"."datasets" USING btree ("created_at");
  CREATE INDEX "datasets__status_idx" ON "payload"."datasets" USING btree ("_status");
  CREATE INDEX "_datasets_v_version_id_strategy_computed_id_fields_order_idx" ON "payload"."_datasets_v_version_id_strategy_computed_id_fields" USING btree ("_order");
  CREATE INDEX "_datasets_v_version_id_strategy_computed_id_fields_parent_id_idx" ON "payload"."_datasets_v_version_id_strategy_computed_id_fields" USING btree ("_parent_id");
  CREATE INDEX "_transforms_v_order_idx" ON "payload"."_transforms_v" USING btree ("_order");
  CREATE INDEX "_transforms_v_parent_id_idx" ON "payload"."_transforms_v" USING btree ("_parent_id");
  CREATE INDEX "_datasets_v_parent_idx" ON "payload"."_datasets_v" USING btree ("parent_id");
  CREATE INDEX "_datasets_v_version_version_slug_idx" ON "payload"."_datasets_v" USING btree ("version_slug");
  CREATE INDEX "_datasets_v_version_version_catalog_idx" ON "payload"."_datasets_v" USING btree ("version_catalog_id");
  CREATE INDEX "_datasets_v_version_version_updated_at_idx" ON "payload"."_datasets_v" USING btree ("version_updated_at");
  CREATE INDEX "_datasets_v_version_version_created_at_idx" ON "payload"."_datasets_v" USING btree ("version_created_at");
  CREATE INDEX "_datasets_v_version_version__status_idx" ON "payload"."_datasets_v" USING btree ("version__status");
  CREATE INDEX "_datasets_v_created_at_idx" ON "payload"."_datasets_v" USING btree ("created_at");
  CREATE INDEX "_datasets_v_updated_at_idx" ON "payload"."_datasets_v" USING btree ("updated_at");
  CREATE INDEX "_datasets_v_latest_idx" ON "payload"."_datasets_v" USING btree ("latest");
  CREATE INDEX "_datasets_v_autosave_idx" ON "payload"."_datasets_v" USING btree ("autosave");
  CREATE INDEX "dataset_schemas_schema_summary_new_fields_order_idx" ON "payload"."dataset_schemas_schema_summary_new_fields" USING btree ("_order");
  CREATE INDEX "dataset_schemas_schema_summary_new_fields_parent_id_idx" ON "payload"."dataset_schemas_schema_summary_new_fields" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_schema_summary_removed_fields_order_idx" ON "payload"."dataset_schemas_schema_summary_removed_fields" USING btree ("_order");
  CREATE INDEX "dataset_schemas_schema_summary_removed_fields_parent_id_idx" ON "payload"."dataset_schemas_schema_summary_removed_fields" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_schema_summary_type_changes_order_idx" ON "payload"."dataset_schemas_schema_summary_type_changes" USING btree ("_order");
  CREATE INDEX "dataset_schemas_schema_summary_type_changes_parent_id_idx" ON "payload"."dataset_schemas_schema_summary_type_changes" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_schema_summary_enum_changes_order_idx" ON "payload"."dataset_schemas_schema_summary_enum_changes" USING btree ("_order");
  CREATE INDEX "dataset_schemas_schema_summary_enum_changes_parent_id_idx" ON "payload"."dataset_schemas_schema_summary_enum_changes" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_import_sources_order_idx" ON "payload"."dataset_schemas_import_sources" USING btree ("_order");
  CREATE INDEX "dataset_schemas_import_sources_parent_id_idx" ON "payload"."dataset_schemas_import_sources" USING btree ("_parent_id");
  CREATE INDEX "dataset_schemas_import_sources_import_idx" ON "payload"."dataset_schemas_import_sources" USING btree ("import_id");
  CREATE INDEX "dataset_schemas_dataset_idx" ON "payload"."dataset_schemas" USING btree ("dataset_id");
  CREATE INDEX "dataset_schemas_approved_by_idx" ON "payload"."dataset_schemas" USING btree ("approved_by_id");
  CREATE INDEX "dataset_schemas_updated_at_idx" ON "payload"."dataset_schemas" USING btree ("updated_at");
  CREATE INDEX "dataset_schemas_created_at_idx" ON "payload"."dataset_schemas" USING btree ("created_at");
  CREATE INDEX "dataset_schemas__status_idx" ON "payload"."dataset_schemas" USING btree ("_status");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_new_fields_order_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_new_fields" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_new_fields_parent_id_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_new_fields" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_removed_fields_order_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_removed_fields_parent_id_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_type_changes_order_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_type_changes" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_type_changes_parent_id_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_type_changes" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_enum_changes_order_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_schema_summary_enum_changes_parent_id_idx" ON "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_import_sources_order_idx" ON "payload"."_dataset_schemas_v_version_import_sources" USING btree ("_order");
  CREATE INDEX "_dataset_schemas_v_version_import_sources_parent_id_idx" ON "payload"."_dataset_schemas_v_version_import_sources" USING btree ("_parent_id");
  CREATE INDEX "_dataset_schemas_v_version_import_sources_import_idx" ON "payload"."_dataset_schemas_v_version_import_sources" USING btree ("import_id");
  CREATE INDEX "_dataset_schemas_v_parent_idx" ON "payload"."_dataset_schemas_v" USING btree ("parent_id");
  CREATE INDEX "_dataset_schemas_v_version_version_dataset_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_dataset_id");
  CREATE INDEX "_dataset_schemas_v_version_version_approved_by_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_approved_by_id");
  CREATE INDEX "_dataset_schemas_v_version_version_updated_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_updated_at");
  CREATE INDEX "_dataset_schemas_v_version_version_created_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("version_created_at");
  CREATE INDEX "_dataset_schemas_v_version_version__status_idx" ON "payload"."_dataset_schemas_v" USING btree ("version__status");
  CREATE INDEX "_dataset_schemas_v_created_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("created_at");
  CREATE INDEX "_dataset_schemas_v_updated_at_idx" ON "payload"."_dataset_schemas_v" USING btree ("updated_at");
  CREATE INDEX "_dataset_schemas_v_latest_idx" ON "payload"."_dataset_schemas_v" USING btree ("latest");
  CREATE INDEX "_dataset_schemas_v_autosave_idx" ON "payload"."_dataset_schemas_v" USING btree ("autosave");
  CREATE INDEX "import_files_catalog_idx" ON "payload"."import_files" USING btree ("catalog_id");
  CREATE INDEX "import_files_user_idx" ON "payload"."import_files" USING btree ("user_id");
  CREATE INDEX "import_files_updated_at_idx" ON "payload"."import_files" USING btree ("updated_at");
  CREATE INDEX "import_files_created_at_idx" ON "payload"."import_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "import_files_filename_idx" ON "payload"."import_files" USING btree ("filename");
  CREATE INDEX "import_files_rels_order_idx" ON "payload"."import_files_rels" USING btree ("order");
  CREATE INDEX "import_files_rels_parent_idx" ON "payload"."import_files_rels" USING btree ("parent_id");
  CREATE INDEX "import_files_rels_path_idx" ON "payload"."import_files_rels" USING btree ("path");
  CREATE INDEX "import_files_rels_datasets_id_idx" ON "payload"."import_files_rels" USING btree ("datasets_id");
  CREATE INDEX "_import_files_v_parent_idx" ON "payload"."_import_files_v" USING btree ("parent_id");
  CREATE INDEX "_import_files_v_version_version_catalog_idx" ON "payload"."_import_files_v" USING btree ("version_catalog_id");
  CREATE INDEX "_import_files_v_version_version_user_idx" ON "payload"."_import_files_v" USING btree ("version_user_id");
  CREATE INDEX "_import_files_v_version_version_updated_at_idx" ON "payload"."_import_files_v" USING btree ("version_updated_at");
  CREATE INDEX "_import_files_v_version_version_created_at_idx" ON "payload"."_import_files_v" USING btree ("version_created_at");
  CREATE INDEX "_import_files_v_version_version_filename_idx" ON "payload"."_import_files_v" USING btree ("version_filename");
  CREATE INDEX "_import_files_v_created_at_idx" ON "payload"."_import_files_v" USING btree ("created_at");
  CREATE INDEX "_import_files_v_updated_at_idx" ON "payload"."_import_files_v" USING btree ("updated_at");
  CREATE INDEX "_import_files_v_rels_order_idx" ON "payload"."_import_files_v_rels" USING btree ("order");
  CREATE INDEX "_import_files_v_rels_parent_idx" ON "payload"."_import_files_v_rels" USING btree ("parent_id");
  CREATE INDEX "_import_files_v_rels_path_idx" ON "payload"."_import_files_v_rels" USING btree ("path");
  CREATE INDEX "_import_files_v_rels_datasets_id_idx" ON "payload"."_import_files_v_rels" USING btree ("datasets_id");
  CREATE INDEX "import_jobs_errors_order_idx" ON "payload"."import_jobs_errors" USING btree ("_order");
  CREATE INDEX "import_jobs_errors_parent_id_idx" ON "payload"."import_jobs_errors" USING btree ("_parent_id");
  CREATE INDEX "import_jobs_import_file_idx" ON "payload"."import_jobs" USING btree ("import_file_id");
  CREATE INDEX "import_jobs_dataset_idx" ON "payload"."import_jobs" USING btree ("dataset_id");
  CREATE INDEX "import_jobs_schema_validation_schema_validation_approved_by_idx" ON "payload"."import_jobs" USING btree ("schema_validation_approved_by_id");
  CREATE INDEX "import_jobs_dataset_schema_version_idx" ON "payload"."import_jobs" USING btree ("dataset_schema_version_id");
  CREATE INDEX "import_jobs_updated_at_idx" ON "payload"."import_jobs" USING btree ("updated_at");
  CREATE INDEX "import_jobs_created_at_idx" ON "payload"."import_jobs" USING btree ("created_at");
  CREATE INDEX "_import_jobs_v_version_errors_order_idx" ON "payload"."_import_jobs_v_version_errors" USING btree ("_order");
  CREATE INDEX "_import_jobs_v_version_errors_parent_id_idx" ON "payload"."_import_jobs_v_version_errors" USING btree ("_parent_id");
  CREATE INDEX "_import_jobs_v_parent_idx" ON "payload"."_import_jobs_v" USING btree ("parent_id");
  CREATE INDEX "_import_jobs_v_version_version_import_file_idx" ON "payload"."_import_jobs_v" USING btree ("version_import_file_id");
  CREATE INDEX "_import_jobs_v_version_version_dataset_idx" ON "payload"."_import_jobs_v" USING btree ("version_dataset_id");
  CREATE INDEX "_import_jobs_v_version_schema_validation_version_schema_validation_approved_by_idx" ON "payload"."_import_jobs_v" USING btree ("version_schema_validation_approved_by_id");
  CREATE INDEX "_import_jobs_v_version_version_dataset_schema_version_idx" ON "payload"."_import_jobs_v" USING btree ("version_dataset_schema_version_id");
  CREATE INDEX "_import_jobs_v_version_version_updated_at_idx" ON "payload"."_import_jobs_v" USING btree ("version_updated_at");
  CREATE INDEX "_import_jobs_v_version_version_created_at_idx" ON "payload"."_import_jobs_v" USING btree ("version_created_at");
  CREATE INDEX "_import_jobs_v_created_at_idx" ON "payload"."_import_jobs_v" USING btree ("created_at");
  CREATE INDEX "_import_jobs_v_updated_at_idx" ON "payload"."_import_jobs_v" USING btree ("updated_at");
  CREATE INDEX "events_dataset_idx" ON "payload"."events" USING btree ("dataset_id");
  CREATE INDEX "events_import_job_idx" ON "payload"."events" USING btree ("import_job_id");
  CREATE UNIQUE INDEX "events_unique_id_idx" ON "payload"."events" USING btree ("unique_id");
  CREATE INDEX "events_source_id_idx" ON "payload"."events" USING btree ("source_id");
  CREATE INDEX "events_content_hash_idx" ON "payload"."events" USING btree ("content_hash");
  CREATE INDEX "events_import_batch_idx" ON "payload"."events" USING btree ("import_batch");
  CREATE INDEX "events_validation_status_idx" ON "payload"."events" USING btree ("validation_status");
  CREATE INDEX "events_updated_at_idx" ON "payload"."events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "payload"."events" USING btree ("created_at");
  CREATE INDEX "events__status_idx" ON "payload"."events" USING btree ("_status");
  CREATE INDEX "dataset_eventTimestamp_idx" ON "payload"."events" USING btree ("dataset_id","event_timestamp");
  CREATE INDEX "eventTimestamp_idx" ON "payload"."events" USING btree ("event_timestamp");
  CREATE INDEX "uniqueId_idx" ON "payload"."events" USING btree ("unique_id");
  CREATE INDEX "dataset_contentHash_idx" ON "payload"."events" USING btree ("dataset_id","content_hash");
  CREATE INDEX "importJob_importBatch_idx" ON "payload"."events" USING btree ("import_job_id","import_batch");
  CREATE INDEX "validationStatus_idx" ON "payload"."events" USING btree ("validation_status");
  CREATE INDEX "_events_v_parent_idx" ON "payload"."_events_v" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_version_dataset_idx" ON "payload"."_events_v" USING btree ("version_dataset_id");
  CREATE INDEX "_events_v_version_version_import_job_idx" ON "payload"."_events_v" USING btree ("version_import_job_id");
  CREATE INDEX "_events_v_version_version_unique_id_idx" ON "payload"."_events_v" USING btree ("version_unique_id");
  CREATE INDEX "_events_v_version_version_source_id_idx" ON "payload"."_events_v" USING btree ("version_source_id");
  CREATE INDEX "_events_v_version_version_content_hash_idx" ON "payload"."_events_v" USING btree ("version_content_hash");
  CREATE INDEX "_events_v_version_version_import_batch_idx" ON "payload"."_events_v" USING btree ("version_import_batch");
  CREATE INDEX "_events_v_version_version_validation_status_idx" ON "payload"."_events_v" USING btree ("version_validation_status");
  CREATE INDEX "_events_v_version_version_updated_at_idx" ON "payload"."_events_v" USING btree ("version_updated_at");
  CREATE INDEX "_events_v_version_version_created_at_idx" ON "payload"."_events_v" USING btree ("version_created_at");
  CREATE INDEX "_events_v_version_version__status_idx" ON "payload"."_events_v" USING btree ("version__status");
  CREATE INDEX "_events_v_created_at_idx" ON "payload"."_events_v" USING btree ("created_at");
  CREATE INDEX "_events_v_updated_at_idx" ON "payload"."_events_v" USING btree ("updated_at");
  CREATE INDEX "_events_v_latest_idx" ON "payload"."_events_v" USING btree ("latest");
  CREATE INDEX "_events_v_autosave_idx" ON "payload"."_events_v" USING btree ("autosave");
  CREATE INDEX "version_dataset_version_eventTimestamp_idx" ON "payload"."_events_v" USING btree ("version_dataset_id","version_event_timestamp");
  CREATE INDEX "version_eventTimestamp_idx" ON "payload"."_events_v" USING btree ("version_event_timestamp");
  CREATE INDEX "version_uniqueId_idx" ON "payload"."_events_v" USING btree ("version_unique_id");
  CREATE INDEX "version_dataset_version_contentHash_idx" ON "payload"."_events_v" USING btree ("version_dataset_id","version_content_hash");
  CREATE INDEX "version_importJob_version_importBatch_idx" ON "payload"."_events_v" USING btree ("version_import_job_id","version_import_batch");
  CREATE INDEX "version_validationStatus_idx" ON "payload"."_events_v" USING btree ("version_validation_status");
  CREATE INDEX "users_sessions_order_idx" ON "payload"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "payload"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "payload"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "payload"."users" USING btree ("created_at");
  CREATE INDEX "users__status_idx" ON "payload"."users" USING btree ("_status");
  CREATE UNIQUE INDEX "users_email_idx" ON "payload"."users" USING btree ("email");
  CREATE INDEX "_users_v_version_sessions_order_idx" ON "payload"."_users_v_version_sessions" USING btree ("_order");
  CREATE INDEX "_users_v_version_sessions_parent_id_idx" ON "payload"."_users_v_version_sessions" USING btree ("_parent_id");
  CREATE INDEX "_users_v_parent_idx" ON "payload"."_users_v" USING btree ("parent_id");
  CREATE INDEX "_users_v_version_version_updated_at_idx" ON "payload"."_users_v" USING btree ("version_updated_at");
  CREATE INDEX "_users_v_version_version_created_at_idx" ON "payload"."_users_v" USING btree ("version_created_at");
  CREATE INDEX "_users_v_version_version__status_idx" ON "payload"."_users_v" USING btree ("version__status");
  CREATE INDEX "_users_v_version_version_email_idx" ON "payload"."_users_v" USING btree ("version_email");
  CREATE INDEX "_users_v_created_at_idx" ON "payload"."_users_v" USING btree ("created_at");
  CREATE INDEX "_users_v_updated_at_idx" ON "payload"."_users_v" USING btree ("updated_at");
  CREATE INDEX "_users_v_latest_idx" ON "payload"."_users_v" USING btree ("latest");
  CREATE INDEX "_users_v_autosave_idx" ON "payload"."_users_v" USING btree ("autosave");
  CREATE INDEX "media_updated_at_idx" ON "payload"."media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "payload"."media" USING btree ("created_at");
  CREATE INDEX "media__status_idx" ON "payload"."media" USING btree ("_status");
  CREATE UNIQUE INDEX "media_filename_idx" ON "payload"."media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "payload"."media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "payload"."media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_tablet_sizes_tablet_filename_idx" ON "payload"."media" USING btree ("sizes_tablet_filename");
  CREATE INDEX "_media_v_parent_idx" ON "payload"."_media_v" USING btree ("parent_id");
  CREATE INDEX "_media_v_version_version_updated_at_idx" ON "payload"."_media_v" USING btree ("version_updated_at");
  CREATE INDEX "_media_v_version_version_created_at_idx" ON "payload"."_media_v" USING btree ("version_created_at");
  CREATE INDEX "_media_v_version_version__status_idx" ON "payload"."_media_v" USING btree ("version__status");
  CREATE INDEX "_media_v_version_version_filename_idx" ON "payload"."_media_v" USING btree ("version_filename");
  CREATE INDEX "_media_v_version_sizes_thumbnail_version_sizes_thumbnail_filename_idx" ON "payload"."_media_v" USING btree ("version_sizes_thumbnail_filename");
  CREATE INDEX "_media_v_version_sizes_card_version_sizes_card_filename_idx" ON "payload"."_media_v" USING btree ("version_sizes_card_filename");
  CREATE INDEX "_media_v_version_sizes_tablet_version_sizes_tablet_filename_idx" ON "payload"."_media_v" USING btree ("version_sizes_tablet_filename");
  CREATE INDEX "_media_v_created_at_idx" ON "payload"."_media_v" USING btree ("created_at");
  CREATE INDEX "_media_v_updated_at_idx" ON "payload"."_media_v" USING btree ("updated_at");
  CREATE INDEX "_media_v_latest_idx" ON "payload"."_media_v" USING btree ("latest");
  CREATE INDEX "_media_v_autosave_idx" ON "payload"."_media_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "location_cache_original_address_idx" ON "payload"."location_cache" USING btree ("original_address");
  CREATE INDEX "location_cache_normalized_address_idx" ON "payload"."location_cache" USING btree ("normalized_address");
  CREATE INDEX "location_cache_updated_at_idx" ON "payload"."location_cache" USING btree ("updated_at");
  CREATE INDEX "location_cache_created_at_idx" ON "payload"."location_cache" USING btree ("created_at");
  CREATE INDEX "location_cache__status_idx" ON "payload"."location_cache" USING btree ("_status");
  CREATE INDEX "_location_cache_v_parent_idx" ON "payload"."_location_cache_v" USING btree ("parent_id");
  CREATE INDEX "_location_cache_v_version_version_original_address_idx" ON "payload"."_location_cache_v" USING btree ("version_original_address");
  CREATE INDEX "_location_cache_v_version_version_normalized_address_idx" ON "payload"."_location_cache_v" USING btree ("version_normalized_address");
  CREATE INDEX "_location_cache_v_version_version_updated_at_idx" ON "payload"."_location_cache_v" USING btree ("version_updated_at");
  CREATE INDEX "_location_cache_v_version_version_created_at_idx" ON "payload"."_location_cache_v" USING btree ("version_created_at");
  CREATE INDEX "_location_cache_v_version_version__status_idx" ON "payload"."_location_cache_v" USING btree ("version__status");
  CREATE INDEX "_location_cache_v_created_at_idx" ON "payload"."_location_cache_v" USING btree ("created_at");
  CREATE INDEX "_location_cache_v_updated_at_idx" ON "payload"."_location_cache_v" USING btree ("updated_at");
  CREATE INDEX "_location_cache_v_latest_idx" ON "payload"."_location_cache_v" USING btree ("latest");
  CREATE INDEX "_location_cache_v_autosave_idx" ON "payload"."_location_cache_v" USING btree ("autosave");
  CREATE INDEX "geocoding_providers_tags_order_idx" ON "payload"."geocoding_providers_tags" USING btree ("order");
  CREATE INDEX "geocoding_providers_tags_parent_idx" ON "payload"."geocoding_providers_tags" USING btree ("parent_id");
  CREATE UNIQUE INDEX "geocoding_providers_name_idx" ON "payload"."geocoding_providers" USING btree ("name");
  CREATE INDEX "geocoding_providers_updated_at_idx" ON "payload"."geocoding_providers" USING btree ("updated_at");
  CREATE INDEX "geocoding_providers_created_at_idx" ON "payload"."geocoding_providers" USING btree ("created_at");
  CREATE INDEX "geocoding_providers__status_idx" ON "payload"."geocoding_providers" USING btree ("_status");
  CREATE INDEX "_geocoding_providers_v_version_tags_order_idx" ON "payload"."_geocoding_providers_v_version_tags" USING btree ("order");
  CREATE INDEX "_geocoding_providers_v_version_tags_parent_idx" ON "payload"."_geocoding_providers_v_version_tags" USING btree ("parent_id");
  CREATE INDEX "_geocoding_providers_v_parent_idx" ON "payload"."_geocoding_providers_v" USING btree ("parent_id");
  CREATE INDEX "_geocoding_providers_v_version_version_name_idx" ON "payload"."_geocoding_providers_v" USING btree ("version_name");
  CREATE INDEX "_geocoding_providers_v_version_version_updated_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("version_updated_at");
  CREATE INDEX "_geocoding_providers_v_version_version_created_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("version_created_at");
  CREATE INDEX "_geocoding_providers_v_version_version__status_idx" ON "payload"."_geocoding_providers_v" USING btree ("version__status");
  CREATE INDEX "_geocoding_providers_v_created_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("created_at");
  CREATE INDEX "_geocoding_providers_v_updated_at_idx" ON "payload"."_geocoding_providers_v" USING btree ("updated_at");
  CREATE INDEX "_geocoding_providers_v_latest_idx" ON "payload"."_geocoding_providers_v" USING btree ("latest");
  CREATE INDEX "_geocoding_providers_v_autosave_idx" ON "payload"."_geocoding_providers_v" USING btree ("autosave");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "payload"."pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "payload"."pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "payload"."pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "payload"."pages" USING btree ("_status");
  CREATE INDEX "_pages_v_parent_idx" ON "payload"."_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "payload"."_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "payload"."_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "payload"."_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "payload"."_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "payload"."_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "payload"."_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "payload"."_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "payload"."_pages_v" USING btree ("autosave");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload"."payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload"."payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload"."payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload"."payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload"."payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload"."payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload"."payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload"."payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload"."payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload"."payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload"."payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_catalogs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("catalogs_id");
  CREATE INDEX "payload_locked_documents_rels_datasets_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("datasets_id");
  CREATE INDEX "payload_locked_documents_rels_dataset_schemas_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("dataset_schemas_id");
  CREATE INDEX "payload_locked_documents_rels_import_files_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("import_files_id");
  CREATE INDEX "payload_locked_documents_rels_import_jobs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("import_jobs_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_location_cache_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("location_cache_id");
  CREATE INDEX "payload_locked_documents_rels_geocoding_providers_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("geocoding_providers_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_payload_jobs_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("payload_jobs_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload"."payload_migrations" USING btree ("created_at");
  CREATE INDEX "main_menu_nav_items_order_idx" ON "payload"."main_menu_nav_items" USING btree ("_order");
  CREATE INDEX "main_menu_nav_items_parent_id_idx" ON "payload"."main_menu_nav_items" USING btree ("_parent_id");
  CREATE INDEX "main_menu__status_idx" ON "payload"."main_menu" USING btree ("_status");
  CREATE INDEX "_main_menu_v_version_nav_items_order_idx" ON "payload"."_main_menu_v_version_nav_items" USING btree ("_order");
  CREATE INDEX "_main_menu_v_version_nav_items_parent_id_idx" ON "payload"."_main_menu_v_version_nav_items" USING btree ("_parent_id");
  CREATE INDEX "_main_menu_v_version_version__status_idx" ON "payload"."_main_menu_v" USING btree ("version__status");
  CREATE INDEX "_main_menu_v_created_at_idx" ON "payload"."_main_menu_v" USING btree ("created_at");
  CREATE INDEX "_main_menu_v_updated_at_idx" ON "payload"."_main_menu_v" USING btree ("updated_at");
  CREATE INDEX "_main_menu_v_latest_idx" ON "payload"."_main_menu_v" USING btree ("latest");
  CREATE INDEX "_main_menu_v_autosave_idx" ON "payload"."_main_menu_v" USING btree ("autosave");`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "payload"."catalogs" CASCADE;
  DROP TABLE "payload"."_catalogs_v" CASCADE;
  DROP TABLE "payload"."datasets_id_strategy_computed_id_fields" CASCADE;
  DROP TABLE "payload"."transforms" CASCADE;
  DROP TABLE "payload"."datasets" CASCADE;
  DROP TABLE "payload"."_datasets_v_version_id_strategy_computed_id_fields" CASCADE;
  DROP TABLE "payload"."_transforms_v" CASCADE;
  DROP TABLE "payload"."_datasets_v" CASCADE;
  DROP TABLE "payload"."dataset_schemas_schema_summary_new_fields" CASCADE;
  DROP TABLE "payload"."dataset_schemas_schema_summary_removed_fields" CASCADE;
  DROP TABLE "payload"."dataset_schemas_schema_summary_type_changes" CASCADE;
  DROP TABLE "payload"."dataset_schemas_schema_summary_enum_changes" CASCADE;
  DROP TABLE "payload"."dataset_schemas_import_sources" CASCADE;
  DROP TABLE "payload"."dataset_schemas" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_schema_summary_new_fields" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_schema_summary_removed_fields" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_schema_summary_type_changes" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_schema_summary_enum_changes" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v_version_import_sources" CASCADE;
  DROP TABLE "payload"."_dataset_schemas_v" CASCADE;
  DROP TABLE "payload"."import_files" CASCADE;
  DROP TABLE "payload"."import_files_rels" CASCADE;
  DROP TABLE "payload"."_import_files_v" CASCADE;
  DROP TABLE "payload"."_import_files_v_rels" CASCADE;
  DROP TABLE "payload"."import_jobs_errors" CASCADE;
  DROP TABLE "payload"."import_jobs" CASCADE;
  DROP TABLE "payload"."_import_jobs_v_version_errors" CASCADE;
  DROP TABLE "payload"."_import_jobs_v" CASCADE;
  DROP TABLE "payload"."events" CASCADE;
  DROP TABLE "payload"."_events_v" CASCADE;
  DROP TABLE "payload"."users_sessions" CASCADE;
  DROP TABLE "payload"."users" CASCADE;
  DROP TABLE "payload"."_users_v_version_sessions" CASCADE;
  DROP TABLE "payload"."_users_v" CASCADE;
  DROP TABLE "payload"."media" CASCADE;
  DROP TABLE "payload"."_media_v" CASCADE;
  DROP TABLE "payload"."location_cache" CASCADE;
  DROP TABLE "payload"."_location_cache_v" CASCADE;
  DROP TABLE "payload"."geocoding_providers_tags" CASCADE;
  DROP TABLE "payload"."geocoding_providers" CASCADE;
  DROP TABLE "payload"."_geocoding_providers_v_version_tags" CASCADE;
  DROP TABLE "payload"."_geocoding_providers_v" CASCADE;
  DROP TABLE "payload"."pages" CASCADE;
  DROP TABLE "payload"."_pages_v" CASCADE;
  DROP TABLE "payload"."payload_jobs_log" CASCADE;
  DROP TABLE "payload"."payload_jobs" CASCADE;
  DROP TABLE "payload"."payload_locked_documents" CASCADE;
  DROP TABLE "payload"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload"."payload_preferences" CASCADE;
  DROP TABLE "payload"."payload_preferences_rels" CASCADE;
  DROP TABLE "payload"."payload_migrations" CASCADE;
  DROP TABLE "payload"."main_menu_nav_items" CASCADE;
  DROP TABLE "payload"."main_menu" CASCADE;
  DROP TABLE "payload"."_main_menu_v_version_nav_items" CASCADE;
  DROP TABLE "payload"."_main_menu_v" CASCADE;
  DROP TYPE "payload"."enum_catalogs_status";
  DROP TYPE "payload"."enum__catalogs_v_version_status";
  DROP TYPE "payload"."enum_transforms_from_type";
  DROP TYPE "payload"."enum_transforms_to_type";
  DROP TYPE "payload"."strategy";
  DROP TYPE "payload"."enum_datasets_id_strategy_type";
  DROP TYPE "payload"."enum_datasets_id_strategy_duplicate_strategy";
  DROP TYPE "payload"."enum_datasets_schema_config_enum_mode";
  DROP TYPE "payload"."enum_datasets_deduplication_config_strategy";
  DROP TYPE "payload"."enum_datasets_enum_detection_mode";
  DROP TYPE "payload"."enum_datasets_status";
  DROP TYPE "payload"."enum__transforms_v_from_type";
  DROP TYPE "payload"."enum__transforms_v_to_type";
  DROP TYPE "payload"."enum__datasets_v_version_id_strategy_type";
  DROP TYPE "payload"."enum__datasets_v_version_id_strategy_duplicate_strategy";
  DROP TYPE "payload"."enum__datasets_v_version_schema_config_enum_mode";
  DROP TYPE "payload"."enum__datasets_v_version_deduplication_config_strategy";
  DROP TYPE "payload"."enum__datasets_v_version_enum_detection_mode";
  DROP TYPE "payload"."enum__datasets_v_version_status";
  DROP TYPE "payload"."enum_dataset_schemas_status";
  DROP TYPE "payload"."enum__dataset_schemas_v_version_status";
  DROP TYPE "payload"."enum_import_files_status";
  DROP TYPE "payload"."enum__import_files_v_version_status";
  DROP TYPE "payload"."enum_import_jobs_stage";
  DROP TYPE "payload"."enum_import_jobs_last_successful_stage";
  DROP TYPE "payload"."enum__import_jobs_v_version_stage";
  DROP TYPE "payload"."enum__import_jobs_v_version_last_successful_stage";
  DROP TYPE "payload"."enum_events_coordinate_source_type";
  DROP TYPE "payload"."enum_events_coordinate_source_validation_status";
  DROP TYPE "payload"."enum_events_geocoding_info_geocoding_status";
  DROP TYPE "payload"."enum_events_geocoding_info_provider";
  DROP TYPE "payload"."enum_events_validation_status";
  DROP TYPE "payload"."enum_events_status";
  DROP TYPE "payload"."enum__events_v_version_coordinate_source_type";
  DROP TYPE "payload"."enum__events_v_version_coordinate_source_validation_status";
  DROP TYPE "payload"."enum__events_v_version_geocoding_info_geocoding_status";
  DROP TYPE "payload"."enum__events_v_version_geocoding_info_provider";
  DROP TYPE "payload"."enum__events_v_version_validation_status";
  DROP TYPE "payload"."enum__events_v_version_status";
  DROP TYPE "payload"."enum_users_role";
  DROP TYPE "payload"."enum_users_status";
  DROP TYPE "payload"."enum__users_v_version_role";
  DROP TYPE "payload"."enum__users_v_version_status";
  DROP TYPE "payload"."enum_media_status";
  DROP TYPE "payload"."enum__media_v_version_status";
  DROP TYPE "payload"."enum_location_cache_status";
  DROP TYPE "payload"."enum__location_cache_v_version_status";
  DROP TYPE "payload"."enum_geocoding_providers_tags";
  DROP TYPE "payload"."enum_geocoding_providers_type";
  DROP TYPE "payload"."enum_geocoding_providers_status";
  DROP TYPE "payload"."enum__geocoding_providers_v_version_tags";
  DROP TYPE "payload"."enum__geocoding_providers_v_version_type";
  DROP TYPE "payload"."enum__geocoding_providers_v_version_status";
  DROP TYPE "payload"."enum_pages_status";
  DROP TYPE "payload"."enum__pages_v_version_status";
  DROP TYPE "payload"."enum_payload_jobs_log_task_slug";
  DROP TYPE "payload"."enum_payload_jobs_log_state";
  DROP TYPE "payload"."enum_payload_jobs_task_slug";
  DROP TYPE "payload"."enum_main_menu_status";
  DROP TYPE "payload"."enum__main_menu_v_version_status";`);
}
